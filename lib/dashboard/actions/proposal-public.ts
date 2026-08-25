"use server";

import { headers } from "next/headers";
import { db } from "../db";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { agreementReadyEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
import { generateNumber } from "./documents";
import { buildAgreementContent } from "../agreement-template";
import { formatDate } from "../format";
import type { Proposal } from "../types";

/**
 * Public action surface for the token-gated /proposal/[token] page — no
 * `assertAuthed()` here on purpose, the caller has no session. Every
 * function validates by `access_token` alone via the service-role client,
 * same "trust the server action, not RLS" pattern the rest of the
 * dashboard uses, just for a caller outside the login wall.
 */

export async function getProposalByToken(
  token: string
): Promise<{ proposal: Proposal; items: { id: string; description: string; quantity: number; rate: number; amount: number }[] } | null> {
  const { data: proposal } = await db
    .from("proposals")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (!proposal) return null;

  // Only set on first view — later visits shouldn't overwrite when the
  // prospect first actually saw it.
  if (!proposal.viewed_at && proposal.status === "sent") {
    await db
      .from("proposals")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", proposal.id);
    proposal.status = "viewed";
    proposal.viewed_at = new Date().toISOString();
  }

  const { data: items } = await db
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposal.id)
    .order("sort_order");

  return { proposal: proposal as Proposal, items: items ?? [] };
}

export async function acceptProposal(token: string, signerName: string) {
  const { data: proposal } = await db
    .from("proposals")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (!proposal) return { error: "This proposal link isn't valid." };
  if (proposal.status === "accepted") return { error: "This proposal has already been accepted." };
  if (proposal.status === "declined") return { error: "This proposal was already declined." };
  if (!signerName.trim()) return { error: "Please type your full name to accept." };

  const forwardedFor = (await headers()).get("x-forwarded-for");
  const signerIp = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const now = new Date().toISOString();

  let clientId = proposal.client_id as string | null;
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
    if (clientError) return { error: "Couldn't set up your client record. Please contact us directly." };
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

  // Acceptance generates the Agreement (not onboarding yet) — onboarding
  // only kicks in once the agreement is actually signed, see
  // signAgreement() in agreement-public.ts.
  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const agreementNumber = await generateNumber("agreement", settings?.agreement_prefix ?? "AGR");
  if (!agreementNumber) {
    return { error: "Accepted, but couldn't generate an agreement number. Please contact us directly." };
  }

  const content = buildAgreementContent({
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
  const { error: agreementError } = await db.from("agreements").insert({
    number: agreementNumber,
    proposal_id: proposal.id,
    client_id: clientId,
    content,
    status: "sent",
    access_token: agreementToken,
    sent_at: now,
  });
  if (agreementError) console.error("[proposal-public] Failed to create agreement:", agreementError);

  if (isResendConfigured && !agreementError) {
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
      console.error("[proposal-public] Agreement email failed:", sendError);
    }
  }

  return { ok: true };
}

export async function declineProposal(token: string) {
  const { data: proposal } = await db
    .from("proposals")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!proposal) return { error: "This proposal link isn't valid." };
  if (proposal.status === "accepted") return { error: "This proposal has already been accepted." };

  const { error } = await db
    .from("proposals")
    .update({ status: "declined", declined_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", proposal.id);
  if (error) return { error: error.message };

  return { ok: true };
}
