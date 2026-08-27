import { db } from "./db";
import { resend, isResendConfigured, fromEmail } from "../resend";
import { onboardingInviteEmail } from "../email-templates";
import { siteUrl } from "../seo";
import type { Agreement } from "./types";

/**
 * Core cascade for signing an agreement — creates the onboarding intake
 * and emails the invite. Shared by the public self-serve sign flow
 * (actions/agreement-public.ts) and the dashboard's manual "mark signed"
 * action (actions/agreements.ts) for clients who confirm offline.
 */
export async function performAgreementSigning(
  agreement: Agreement,
  signerName: string,
  signerIp: string | null
): Promise<{ error: string } | { ok: true }> {
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

  const { data: client } = await db.from("clients").select("*").eq("id", agreement.client_id).single();

  const onboardingToken = crypto.randomUUID();
  const { error: intakeError } = await db.from("onboarding_intakes").insert({
    proposal_id: agreement.proposal_id,
    client_id: agreement.client_id,
    access_token: onboardingToken,
  });
  if (intakeError) console.error("[agreement-signing] Failed to create onboarding intake:", intakeError);

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
      console.error("[agreement-signing] Onboarding email failed:", sendError);
    }
  }

  return { ok: true };
}
