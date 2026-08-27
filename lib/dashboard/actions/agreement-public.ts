"use server";

import { headers } from "next/headers";
import { db } from "../db";
import { performAgreementSigning } from "../agreement-signing";
import type { Agreement } from "../types";

/** Public action surface for /agreement/[token] — same "trust the server
 *  action, validate by token, no assertAuthed()" pattern as
 *  proposal-public.ts. */

export async function getAgreementByToken(token: string): Promise<Agreement | null> {
  const { data: agreement } = await db
    .from("agreements")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (!agreement) return null;

  if (!agreement.viewed_at && agreement.status === "sent") {
    await db
      .from("agreements")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", agreement.id);
    agreement.status = "viewed";
    agreement.viewed_at = new Date().toISOString();
  }

  return agreement as Agreement;
}

export async function signAgreement(token: string, signerName: string) {
  const { data: agreement } = await db
    .from("agreements")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (!agreement) return { error: "This agreement link isn't valid." };
  if (agreement.status === "signed") return { error: "This agreement has already been signed." };
  if (agreement.status === "declined") return { error: "This agreement was already declined." };
  if (!signerName.trim()) return { error: "Please type your full name to sign." };

  const forwardedFor = (await headers()).get("x-forwarded-for");
  const signerIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

  return performAgreementSigning(agreement as Agreement, signerName, signerIp);
}

export async function declineAgreement(token: string) {
  const { data: agreement } = await db
    .from("agreements")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!agreement) return { error: "This agreement link isn't valid." };
  if (agreement.status === "signed") return { error: "This agreement has already been signed." };

  const { error } = await db
    .from("agreements")
    .update({ status: "declined", declined_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", agreement.id);
  if (error) return { error: error.message };

  return { ok: true };
}
