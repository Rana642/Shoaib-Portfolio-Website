"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { encryptField, decryptField, isApiVaultCryptoConfigured } from "../../api-vault-crypto";
import type { ApiCredential } from "../types";

/** Every action re-checks auth: server actions are public endpoints, so
 *  middleware alone is not a sufficient guard. */
async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const fieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  value: z.string().max(10000),
});

const credentialSchema = z.object({
  service: z.string().min(1).max(50),
  label: z.string().trim().min(1, "Label is required").max(200),
  notes: z.string().max(2000).optional().nullable(),
  fields: z.array(fieldSchema).max(30),
});

/** The create/edit modal serializes its dynamic field rows as JSON into one
 *  hidden input — same pattern as the client form's inline projects list. */
function parseForm(formData: FormData) {
  let fields: unknown = [];
  try {
    fields = JSON.parse(String(formData.get("fields") || "[]"));
  } catch {
    fields = [];
  }
  return credentialSchema.safeParse({
    service: formData.get("service"),
    label: formData.get("label"),
    notes: formData.get("notes") || null,
    fields,
  });
}

/** List view — deliberately strips field values entirely (even ciphertext)
 *  so the page payload never carries anything beyond which field names
 *  exist. Values are only fetched on demand via revealCredential(). */
export async function listCredentials(): Promise<(Omit<ApiCredential, "fields"> & { fieldNames: string[] })[]> {
  await assertAuthed();
  const { data, error } = await db
    .from("api_credentials")
    .select("id, created_at, updated_at, service, label, notes, is_active, fields")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(({ fields, ...rest }) => ({ ...rest, fieldNames: Object.keys(fields ?? {}) }));
}

/** Decrypts and returns one credential's real values — called only when the
 *  user explicitly clicks "Reveal" on that specific entry. */
export async function revealCredential(id: string): Promise<{ name: string; value: string }[] | { error: string }> {
  await assertAuthed();
  if (!isApiVaultCryptoConfigured) return { error: "API_VAULT_ENCRYPTION_KEY is not configured on the server." };

  const { data, error } = await db.from("api_credentials").select("fields").eq("id", id).single();
  if (error || !data) return { error: error?.message ?? "Not found." };

  try {
    return Object.entries(data.fields as Record<string, string>).map(([name, ciphertext]) => ({
      name,
      value: decryptField(ciphertext),
    }));
  } catch {
    return { error: "Couldn't decrypt this credential — check API_VAULT_ENCRYPTION_KEY hasn't changed." };
  }
}

export async function createCredential(formData: FormData) {
  await assertAuthed();
  if (!isApiVaultCryptoConfigured) return { error: "API_VAULT_ENCRYPTION_KEY is not configured on the server." };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const fields: Record<string, string> = {};
  for (const f of parsed.data.fields) {
    if (f.name.trim() && f.value.trim()) fields[f.name.trim()] = encryptField(f.value);
  }

  const { error } = await db.from("api_credentials").insert({
    service: parsed.data.service,
    label: parsed.data.label,
    notes: parsed.data.notes,
    fields,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/api-vault");
  return { ok: true };
}

/** Edit replaces the full field set — the modal preloads real values via
 *  revealCredential() first, so this is "save what's on screen now", not a
 *  partial merge. A field left blank is dropped rather than saved empty. */
export async function updateCredential(id: string, formData: FormData) {
  await assertAuthed();
  if (!isApiVaultCryptoConfigured) return { error: "API_VAULT_ENCRYPTION_KEY is not configured on the server." };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const fields: Record<string, string> = {};
  for (const f of parsed.data.fields) {
    if (f.name.trim() && f.value.trim()) fields[f.name.trim()] = encryptField(f.value);
  }

  const { error } = await db
    .from("api_credentials")
    .update({
      service: parsed.data.service,
      label: parsed.data.label,
      notes: parsed.data.notes,
      fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/api-vault");
  return { ok: true };
}

export async function setCredentialActive(id: string, is_active: boolean) {
  await assertAuthed();
  const { error } = await db.from("api_credentials").update({ is_active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/api-vault");
  return { ok: true };
}

export async function deleteCredential(id: string) {
  await assertAuthed();
  const { error } = await db.from("api_credentials").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/api-vault");
  return { ok: true };
}
