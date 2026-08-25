"use server";

import { headers } from "next/headers";
import { db } from "../db";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { onboardingInviteEmail } from "../../email-templates";
import { siteUrl } from "../../seo";
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

  const onboardingToken = crypto.randomUUID();
  const { error: intakeError } = await db.from("onboarding_intakes").insert({
    proposal_id: proposal.id,
    client_id: clientId,
    access_token: onboardingToken,
  });
  if (intakeError) console.error("[proposal-public] Failed to create onboarding intake:", intakeError);

  if (isResendConfigured && !intakeError) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: proposal.prospect_email,
        subject: "Welcome aboard — let's get you onboarded",
        html: onboardingInviteEmail({
          name: proposal.prospect_name,
          url: `${siteUrl}/onboarding/${onboardingToken}`,
        }),
      });
    } catch (sendError) {
      console.error("[proposal-public] Onboarding email failed:", sendError);
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
