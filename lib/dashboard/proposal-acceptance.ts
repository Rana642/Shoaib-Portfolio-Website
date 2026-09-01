import { db } from "./db";
import { resend, isResendConfigured, fromEmail } from "../resend";
import { agreementReadyEmail } from "../email-templates";
import { siteUrl } from "../seo";
import { generateNumber } from "./numbering";
import { buildAgreementClauses } from "./agreement-template";
import { formatDate } from "./format";
import type { Proposal } from "./types";

/**
 * Core cascade for accepting a proposal — creates/links the Client,
 * generates the Agreement from the proposal's own scope/fees/terms, and
 * emails it. Shared by the public self-serve accept flow
 * (actions/proposal-public.ts) and the dashboard's manual "mark accepted"
 * action (actions/proposals.ts) for clients who confirm offline — same
 * effect either way, they only differ in how signerName/signerIp are
 * sourced.
 */
export async function performProposalAcceptance(
  proposal: Proposal,
  signerName: string,
  signerIp: string | null,
  options?: { agreementStatus?: "draft" | "sent"; sendEmail?: boolean }
): Promise<{ error: string } | { ok: true; agreementId?: string }> {
  const agreementStatus = options?.agreementStatus ?? "sent";
  const sendEmail = options?.sendEmail ?? true;
  const now = new Date().toISOString();

  let clientId = proposal.client_id;
  if (!clientId) {
    const { data: client, error: clientError } = await db
      .from("clients")
      .insert({
        name: proposal.prospect_business || proposal.prospect_name,
        contact_person: proposal.prospect_business ? proposal.prospect_name : null,
        email: proposal.prospect_email,
        currency: proposal.currency,
      })
      .select("id")
      .single();
    if (clientError) return { error: "Couldn't set up the client record." };
    clientId = client.id;
  }

  const { error } = await db
    .from("proposals")
    .update({
      status: "accepted",
      accepted_at: now,
      client_id: clientId,
      signer_name: signerName.trim(),
      signed_at: now,
      signer_ip: signerIp,
      updated_at: now,
    })
    .eq("id", proposal.id);
  if (error) return { error: error.message };

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const agreementNumber = await generateNumber("agreement", settings?.agreement_prefix ?? "AGR");
  if (!agreementNumber) {
    return { error: "Accepted, but couldn't generate an agreement number. Please contact us directly." };
  }

  const clauses = buildAgreementClauses({
    clientName: proposal.prospect_name,
    clientBusiness: proposal.prospect_business || proposal.prospect_name,
    proposalNumber: proposal.number,
    scopeOfWork: proposal.scope_of_work || "as described in the proposal",
    feeAmount: Number(proposal.total),
    currency: proposal.currency,
    paymentTerms: proposal.terms || "as agreed",
    effectiveDate: formatDate(now.slice(0, 10)),
  });

  const agreementToken = crypto.randomUUID();
  const { data: insertedAgreement, error: agreementError } = await db
    .from("agreements")
    .insert({
      number: agreementNumber,
      proposal_id: proposal.id,
      client_id: clientId,
      clauses,
      status: agreementStatus,
      access_token: agreementToken,
      sent_at: agreementStatus === "sent" ? now : null,
    })
    .select("id")
    .single();
  if (agreementError) console.error("[proposal-acceptance] Failed to create agreement:", agreementError);

  if (isResendConfigured && !agreementError && sendEmail) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: proposal.prospect_email,
        subject: "Your consultation agreement",
        html: agreementReadyEmail({
          name: proposal.prospect_name,
          url: `${siteUrl}/agreement/${agreementToken}`,
        }),
      });
    } catch (sendError) {
      console.error("[proposal-acceptance] Agreement email failed:", sendError);
    }
  }

  return { ok: true, agreementId: insertedAgreement?.id };
}
