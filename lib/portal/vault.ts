"use server";

import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { requirePortalUser, type PortalContext } from "./auth";

/**
 * The portal Owner's Passwords tab. Everything returned is ciphertext the
 * Owner's browser opens with their PIN — the server can't read it. Only
 * Owners of a client with vault sharing on get anything.
 */
async function ownerWithSharing(): Promise<PortalContext | null> {
  const ctx = await requirePortalUser();
  if (ctx.role !== "owner") return null;
  const { data } = await db.from("clients").select("vault_share").eq("id", ctx.clientId).maybeSingle();
  return data?.vault_share ? ctx : null;
}

export async function getMyVaultKey() {
  const ctx = await ownerWithSharing();
  if (!ctx) return { error: "Not available." as const };
  const { data } = await db
    .from("portal_vault_keys")
    .select("wrapped_private_key, iv, salt, iterations")
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  return { key: data ?? null };
}

const keySchema = z.object({
  public_key: z.string().min(100).max(4000),
  wrapped_private_key: z.string().min(100).max(10_000),
  iv: z.string().min(8).max(64),
  salt: z.string().min(8).max(64),
  iterations: z.number().int().min(100_000).max(5_000_000),
});

/** First visit: store the keypair made in the Owner's browser. */
export async function createMyVaultKey(input: z.infer<typeof keySchema>) {
  const ctx = await ownerWithSharing();
  if (!ctx) return { error: "Not available." };
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) return { error: "Couldn't read the key." };
  const { error } = await db.from("portal_vault_keys").insert({ user_id: ctx.user.id, client_id: ctx.clientId, ...parsed.data });
  return error ? { error: error.code === "23505" ? "A PIN is already set." : error.message } : { ok: true };
}

/** Forgot PIN: wipe the key and its copies; Shoaib's next unlock re-shares. */
export async function resetMyVaultKey() {
  const ctx = await ownerWithSharing();
  if (!ctx) return { error: "Not available." };
  await db.from("portal_vault_keys").delete().eq("user_id", ctx.user.id);
  return { ok: true };
}

export async function listMyVaultShares() {
  const ctx = await ownerWithSharing();
  if (!ctx) return { error: "Not available." as const };
  const [{ data: shares }, { data: projects }] = await Promise.all([
    db.from("vault_shares").select("entry_id, project_id, wrapped_key, ciphertext, iv, entry_updated_at").eq("user_id", ctx.user.id),
    db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order"),
  ]);
  return { shares: shares ?? [], projects: projects ?? [] };
}
