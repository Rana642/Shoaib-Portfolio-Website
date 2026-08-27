import { db } from "./db";

/**
 * Proposals a new agreement can be generated from — anything not already
 * accepted (which would already have an agreement, since acceptance
 * always generates one) or declined. Kept out of actions/agreements.ts
 * since this is a plain read, not a mutating server action.
 */
export async function getEligibleProposalsForAgreement() {
  const { data } = await db
    .from("proposals")
    .select("id, number, prospect_name, prospect_business, status")
    .not("status", "in", "(accepted,declined)")
    .order("created_at", { ascending: false });

  return data ?? [];
}
