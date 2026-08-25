"use server";

import { headers } from "next/headers";
import { db } from "../db";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { onboardingInviteEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
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
  const now = new Date().toISOString();

  const { error } = await db
    .from("agreements")
    .update({
      status: "signed",
      signed_at: now,
      signer_name: signerName.trim(),
      signer_ip: signerIp,
      updated_at: now,
    })
    .eq("id", agreement.id);
  if (error) return { error: error.message };

  // Onboarding kicks in only once the agreement is actually signed.
  const { data: client } = await db.from("clients").select("*").eq("id", agreement.client_id).single();

  const onboardingToken = crypto.randomUUID();
  const { error: intakeError } = await db.from("onboarding_intakes").insert({
    proposal_id: agreement.proposal_id,
    client_id: agreement.client_id,
    access_token: onboardingToken,
  });
  if (intakeError) console.error("[agreement-public] Failed to create onboarding intake:", intakeError);

  if (isResendConfigured && !intakeError && client?.email) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: client.email,
        subject: "Welcome aboard — let's get you onboarded",
        html: onboardingInviteEmail({
          name: client.contact_person || client.name,
          url: `${siteUrl}/onboarding/${onboardingToken}`,
        }),
      });
    } catch (sendError) {
      console.error("[agreement-public] Onboarding email failed:", sendError);
    }
  }

  return { ok: true };
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
