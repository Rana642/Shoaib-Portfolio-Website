"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { passwordChangeNoticeEmail } from "../../email-templates";
import { PORTAL_SETUP_MESSAGE } from "../portal-users";
import { isRequestKey } from "../../vault-platforms";
import type { VaultEntry, VaultMeta, VaultRequest, VaultSubmission } from "../types";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

/** The crypto material is opaque to the server — it can't unlock anything
 *  with it. Returned so the browser can derive/unwrap the data key. */
export async function getVaultMeta(): Promise<VaultMeta | null> {
  await assertAuthed();
  const { data } = await db.from("vault_meta").select("*").eq("id", 1).maybeSingle();
  return (data as VaultMeta) ?? null;
}

type MetaInput = {
  salt: string;
  iterations: number;
  wrapped_dk: string;
  wrapped_dk_iv: string;
  wrapped_dk_recovery: string;
  wrapped_dk_recovery_iv: string;
};

/** First-time vault setup — only succeeds if no vault exists yet. */
export async function setupVaultMeta(meta: MetaInput) {
  await assertAuthed();
  const { data: existing } = await db.from("vault_meta").select("id").eq("id", 1).maybeSingle();
  if (existing) return { error: "A vault already exists." };
  const { error } = await db.from("vault_meta").insert({ id: 1, ...meta });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Re-wrap under a new master password (password change / recovery reset). */
export async function updateVaultMaster(meta: {
  salt: string;
  iterations: number;
  wrapped_dk: string;
  wrapped_dk_iv: string;
}) {
  await assertAuthed();
  const { error } = await db.from("vault_meta").update(meta).eq("id", 1);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Store a freshly-minted recovery-key wrap. Replaces the old recovery wrap,
 *  so the previous recovery key stops working. Only the wrapped data key is
 *  sent — the server never sees the recovery key itself. */
export async function updateVaultRecovery(meta: {
  wrapped_dk_recovery: string;
  wrapped_dk_recovery_iv: string;
}) {
  await assertAuthed();
  const { error } = await db.from("vault_meta").update(meta).eq("id", 1);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function listVaultEntries(): Promise<VaultEntry[]> {
  await assertAuthed();
  const { data } = await db.from("vault_entries").select("*").order("created_at");
  return (data ?? []) as VaultEntry[];
}

// An entry as the browser sends it: only ciphertext plus the client/project
// it's filed under. Title, platform and every field are inside ciphertext.
const entrySchema = z.object({
  client_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  ciphertext: z.string().min(1).max(500_000),
  iv: z.string().min(1).max(64),
});
type EntryInput = z.infer<typeof entrySchema>;

const SETUP_MESSAGE =
  "The vault needs a one-time database update — run the “Password vault v2” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";

function friendlyError(error: { code?: string; message: string }) {
  // PGRST204: a column (project_id) the database doesn't have yet.
  return error.code === "PGRST204" ? SETUP_MESSAGE : error.message;
}

/** A project decides its client — never trust the pair from the browser. */
async function resolveLinks(input: EntryInput): Promise<EntryInput | { error: string }> {
  if (!input.project_id) return input;
  const { data } = await db.from("client_projects").select("client_id").eq("id", input.project_id).maybeSingle();
  if (!data) return { error: "That project no longer exists." };
  return { ...input, client_id: data.client_id };
}

// New entries come with a browser-generated id, so accounts added together
// can already link to one another (e.g. Google Ads → the master Gmail being
// added in the same form). A clash with an existing id just fails the
// insert — it can never overwrite a row.
const newEntrySchema = entrySchema.extend({ id: z.string().uuid() });

/** Saves one or more new entries at once (the "add accounts" form). */
export async function createVaultEntries(inputs: z.infer<typeof newEntrySchema>[]) {
  await assertAuthed();
  const parsed = z.array(newEntrySchema).min(1).max(50).safeParse(inputs);
  if (!parsed.success) return { error: "Those entries couldn't be read — nothing was saved." };

  const rows = [];
  for (const { id, ...input } of parsed.data) {
    const resolved = await resolveLinks(input);
    if ("error" in resolved) return resolved;
    rows.push({ id, ...resolved, title: "", service: null });
  }
  const { error } = await db.from("vault_entries").insert(rows);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/dashboard/vault");
  return { ok: true };
}

export async function updateVaultEntry(id: string, input: EntryInput) {
  await assertAuthed();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return { error: "That entry couldn't be read — nothing was saved." };
  }
  const resolved = await resolveLinks(parsed.data);
  if ("error" in resolved) return resolved;
  const { error } = await db
    .from("vault_entries")
    .update({ ...resolved, title: "", service: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/dashboard/vault");
  return { ok: true };
}

export async function deleteVaultEntry(id: string) {
  await assertAuthed();
  const { error } = await db.from("vault_entries").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/vault");
  return { ok: true };
}

const noticeSchema = z.object({
  clientId: z.string().uuid(),
  accounts: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
});

/**
 * Emails a client that passwords on their accounts were changed. The
 * browser (which alone can read the vault) sends only human-readable
 * account names like "Instagram — @toniandguy"; no password ever leaves
 * the vault or goes into the email.
 */
export async function sendPasswordChangeNotice(clientId: string, accounts: string[]) {
  await assertAuthed();
  const parsed = noticeSchema.safeParse({ clientId, accounts });
  if (!parsed.success) return { error: "Nothing to send." };

  const { data: client } = await db.from("clients").select("name, email, contact_person").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Client not found." };
  if (!client.email) return { error: "This client has no email on file — add one on their client page." };
  if (!isResendConfigured) return { error: "Email isn't set up (RESEND_API_KEY is missing)." };

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: client.email,
    subject: "A security update on your accounts",
    html: passwordChangeNoticeEmail({
      name: client.contact_person || client.name,
      accounts: parsed.data.accounts,
    }),
  });
  if (error) {
    console.error("[vault] Resend failed:", error);
    return { error: "Couldn't send the email. Check the Resend configuration." };
  }
  return { ok: true, sentTo: client.email as string };
}

// ── Client portal: keypair, submissions, requests ───────────────

const keypairSchema = z.object({
  public_key: z.string().min(100).max(2000),
  wrapped_private_key: z.string().min(100).max(8000),
  wrapped_private_key_iv: z.string().min(1).max(64),
});

/** Stores the vault keypair the unlocked browser just minted — only if the
 *  vault has none yet, so an existing key (and every submission sealed to
 *  it) can never be silently replaced. */
export async function setVaultKeypair(input: z.infer<typeof keypairSchema>) {
  await assertAuthed();
  const parsed = keypairSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid keypair." };
  const { data, error } = await db
    .from("vault_meta")
    .update(parsed.data)
    .eq("id", 1)
    .is("public_key", null)
    .select("id");
  if (error) return { error: error.message };
  return { ok: true, stored: (data ?? []).length > 0 };
}

/** Sealed submissions waiting to be reviewed. Opaque to the server. */
export async function listVaultSubmissions(): Promise<VaultSubmission[]> {
  await assertAuthed();
  const { data, error } = await db
    .from("vault_submissions")
    .select("*")
    .eq("status", "received")
    .order("created_at");
  if (error) return []; // table not created yet — nothing to show
  return (data ?? []) as VaultSubmission[];
}

/** After import: keep only the status the client sees, wipe the sealed data. */
export async function markSubmissionImported(id: string) {
  await assertAuthed();
  if (!z.string().uuid().safeParse(id).success) return { error: "Not found." };
  const { error } = await db
    .from("vault_submissions")
    .update({ status: "imported", imported_at: new Date().toISOString(), wrapped_key: "", ciphertext: "", iv: "" })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

const requestSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  platforms: z.array(z.string().refine(isRequestKey)).min(1).max(20),
  note: z.string().trim().max(500).optional(),
});

/** Asks a client (via the portal) for specific accounts. */
export async function createVaultRequests(input: z.infer<typeof requestSchema>) {
  await assertAuthed();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick at least one account to request." };
  const { clientId, projectId, platforms, note } = parsed.data;
  if (projectId) {
    const { data: project } = await db.from("client_projects").select("client_id").eq("id", projectId).maybeSingle();
    if (project?.client_id !== clientId) return { error: "That project isn't this client's." };
  }
  const { error } = await db
    .from("vault_requests")
    .insert(platforms.map((platform) => ({ client_id: clientId, project_id: projectId, platform, note: note || null })));
  if (error) return { error: error.code === "PGRST205" ? PORTAL_SETUP_MESSAGE : error.message };
  return { ok: true };
}

export async function listVaultRequests(): Promise<VaultRequest[]> {
  await assertAuthed();
  const { data, error } = await db.from("vault_requests").select("*").is("fulfilled_at", null).order("created_at");
  if (error) return [];
  return (data ?? []) as VaultRequest[];
}

export async function deleteVaultRequest(id: string) {
  await assertAuthed();
  if (!z.string().uuid().safeParse(id).success) return { error: "Not found." };
  const { error } = await db.from("vault_requests").delete().eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}
