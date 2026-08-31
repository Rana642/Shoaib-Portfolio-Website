"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getUser } from "../auth";
import type { VaultEntry, VaultMeta } from "../types";

async function assertAuthed() {
  const user = await getUser();
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

export async function listVaultEntries(): Promise<VaultEntry[]> {
  await assertAuthed();
  const { data } = await db.from("vault_entries").select("*").order("title");
  return (data ?? []) as VaultEntry[];
}

type EntryInput = {
  client_id: string | null;
  title: string;
  service: string | null;
  ciphertext: string;
  iv: string;
};

export async function createVaultEntry(input: EntryInput) {
  await assertAuthed();
  if (!input.title.trim()) return { error: "A title is required." };
  const { error } = await db.from("vault_entries").insert(input);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/vault");
  return { ok: true };
}

export async function updateVaultEntry(id: string, input: EntryInput) {
  await assertAuthed();
  const { error } = await db
    .from("vault_entries")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
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
