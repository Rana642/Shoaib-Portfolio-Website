import { db } from "./db";
import { resend, isResendConfigured, fromEmail } from "../resend";
import { agreementReadyEmail } from "../email-templates";
import { siteUrl } from "../seo";
import { generateNumber } from "./numbering";
import { buildAgreementClauses } from "./agreement-template";
import { calculateTotals, formatDate } from "./format";
import { timestampToDay } from "./offline-dates";
import type { Proposal } from "./types";
import { createRetainerFromProposal } from "./retainers";

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
  options?: {
    agreementStatus?: "draft" | "sent";
    sendEmail?: boolean;
    /** When the client actually accepted (offline confirmations can be
     *  back-dated); defaults to now. Also the agreement's Effective Date. */
    acceptedAt?: string;
  }
): Promise<{ error: string } | { ok: true; agreementId?: string }> {
  const agreementStatus = options?.agreementStatus ?? "sent";
  const sendEmail = options?.sendEmail ?? true;
  const now = new Date().toISOString();
  const acceptedAt = options?.acceptedAt ?? now;

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
      accepted_at: acceptedAt,
      client_id: clientId,
      signer_name: signerName.trim(),
      signed_at: acceptedAt,
      signer_ip: signerIp,
      updated_at: now,
    })
    .eq("id", proposal.id);
  if (error) return { error: error.message };

  // Monthly retainer from the proposal's monthly lines (no-op when there are
  // none). Never blocks acceptance — billing can be set up by hand later.
  try {
    await createRetainerFromProposal(proposal.id, { startDate: timestampToDay(acceptedAt) });
  } catch (retainerError) {
    console.error("[proposal-acceptance] Retainer setup failed:", retainerError);
  }

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const agreementNumber = await generateNumber("agreement", settings?.agreement_prefix ?? "AGR");
  if (!agreementNumber) {
    return { error: "Accepted, but couldn't generate an agreement number. Please contact us directly." };
  }

  // The fee clause quotes the retainer / one-time split, with tools kept
  // out as optional — the same maths the proposal itself shows.
  const { data: items } = await db.from("proposal_items").select("*").eq("proposal_id", proposal.id);
  const lines = (items ?? []).map((i) => ({ ...i, quantity: Number(i.quantity), rate: Number(i.rate) }));
  const totals = calculateTotals(
    lines,
    proposal.tax_enabled,
    Number(proposal.tax_rate),
    { enabled: proposal.discount_enabled, type: proposal.discount_type, value: Number(proposal.discount_value) },
    { enabled: proposal.tools_tax_enabled, rate: Number(proposal.tools_tax_rate) }
  );

  const clauses = buildAgreementClauses({
    clientName: proposal.prospect_name,
    clientBusiness: proposal.prospect_business || proposal.prospect_name,
    proposalNumber: proposal.number,
    scopeOfWork: proposal.scope_of_work || "as described in the proposal",
    fees: {
      monthly: totals.monthlyTotal,
      oneTime: totals.oneTimeTotal,
      tools: totals.toolsTotal,
      toolsMonthly: lines.filter((i) => i.item_type === "tool").every((i) => i.billing_type === "monthly"),
    },
    currency: proposal.currency,
    paymentTerms: proposal.terms || "as agreed",
    effectiveDate: formatDate(timestampToDay(acceptedAt)),
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
