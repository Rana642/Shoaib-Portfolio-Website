"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getUser } from "../auth";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { agreementReadyEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
import { performProposalAcceptance } from "../proposal-acceptance";
import { performAgreementSigning } from "../agreement-signing";
import type { Agreement, Proposal } from "../types";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

/** Sends (first time) or resends (afterwards) an agreement's email — the
 *  content is a frozen snapshot either way, this never regenerates it. A
 *  still-draft agreement gets promoted to "sent" on its first send. */
export async function resendAgreement(id: string) {
  await assertAuthed();

  const { data: agreement } = await db
    .from("agreements")
    .select("*, clients(name, email)")
    .eq("id", id)
    .single();

  if (!agreement) return { error: "Agreement not found." };
  const client = agreement.clients as { name: string; email: string | null } | null;
  if (!client?.email) return { error: "This client has no email on file." };

  if (isResendConfigured) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: client.email,
        subject: "Your consultation agreement",
        html: agreementReadyEmail({
          name: client.name,
          url: `${siteUrl}/agreement/${agreement.access_token}`,
        }),
      });
    } catch (sendError) {
      console.error("[agreements] Resend failed:", sendError);
      return { error: "Couldn't send the email. Check Resend configuration." };
    }
  }

  if (agreement.status === "draft") {
    await db
      .from("agreements")
      .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  revalidatePath(`/dashboard/agreements/${id}`);
  revalidatePath("/dashboard/agreements");
  return { ok: true };
}

/** Manual agreement creation — generates a draft agreement straight from
 *  a proposal, without emailing it (unlike the offline "mark accepted"
 *  flow below, which mirrors the online accept-and-notify path). Useful
 *  when Shoaib wants to review the wording, or deliver it outside email
 *  entirely, before sending. Generating the agreement is what formalizes
 *  the proposal as accepted — there's no such thing as an agreement for a
 *  proposal that hasn't been agreed to. */
export async function createManualAgreement(proposalId: string) {
  await assertAuthed();

  const { data: proposal } = await db.from("proposals").select("*").eq("id", proposalId).single();
  if (!proposal) return { error: "Proposal not found." };
  if (proposal.status === "accepted") {
    return { error: "This proposal already has an agreement — find it from the proposal page." };
  }
  if (proposal.status === "declined") {
    return { error: "This proposal was declined — pick a different one." };
  }

  const result = await performProposalAcceptance(
    proposal as Proposal,
    "Confirmed by Shoaib (offline)",
    null,
    { agreementStatus: "draft", sendEmail: false }
  );
  if ("error" in result) return result;

  revalidatePath("/dashboard/agreements");
  revalidatePath(`/dashboard/proposals/${proposalId}`);
  revalidatePath("/dashboard/proposals");
  if (result.agreementId) redirect(`/dashboard/agreements/${result.agreementId}`);
  return { error: "Agreement created, but couldn't open it. Check the Agreements list." };
}

/** For clients who confirm the agreement itself over a call/WhatsApp
 *  instead of the self-serve link — runs the same signing cascade
 *  (onboarding intake + invite email) as the public sign flow. */
export async function markAgreementSigned(id: string) {
  await assertAuthed();

  const { data: agreement } = await db.from("agreements").select("*").eq("id", id).single();
  if (!agreement) return { error: "Agreement not found." };
  if (agreement.status === "signed") return { error: "This agreement has already been signed." };
  if (agreement.status === "declined") return { error: "This agreement was already declined." };

  const result = await performAgreementSigning(
    agreement as Agreement,
    "Confirmed by Shoaib (offline)",
    null
  );
  if ("error" in result) return result;

  revalidatePath(`/dashboard/agreements/${id}`);
  revalidatePath("/dashboard/agreements");
  revalidatePath("/dashboard/onboarding");
  return { ok: true };
}
