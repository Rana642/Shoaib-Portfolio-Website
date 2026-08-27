"use server";

import { headers } from "next/headers";
import { db } from "../db";
import { performProposalAcceptance } from "../proposal-acceptance";
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
): Promise<{
  proposal: Proposal;
  items: {
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    billing_type: "monthly" | "one_time";
    item_type: "service" | "tool";
  }[];
} | null> {
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

  return performProposalAcceptance(proposal as Proposal, signerName, signerIp);
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
