"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { createManualAgreement } from "@/lib/dashboard/actions/agreements";
import { Field, inputClasses, buttonStyles, Card, EmptyState } from "@/components/dashboard/ui";

type EligibleProposal = {
  id: string;
  number: string;
  prospect_name: string;
  prospect_business: string | null;
  status: string;
};

export default function AgreementForm({ proposals }: { proposals: EligibleProposal[] }) {
  const [proposalId, setProposalId] = useState(proposals[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (proposals.length === 0) {
    return (
      <EmptyState
        title="No proposals ready for an agreement"
        description="An agreement is generated from a proposal — create or send one first, then come back here once the client's on board with it."
        action={
          <Link href="/dashboard/proposals/new" className={buttonStyles.primary}>
            New proposal
          </Link>
        }
      />
    );
  }

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualAgreement(proposalId);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <Card className="p-6 space-y-5 max-w-xl">
      <Field
        label="Proposal"
        htmlFor="proposal_id"
        hint="Generating the agreement marks this proposal accepted — pick the one this client has actually agreed to."
      >
        <select
          id="proposal_id"
          value={proposalId}
          onChange={(e) => setProposalId(e.target.value)}
          className={inputClasses}
        >
          {proposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.number} — {p.prospect_business || p.prospect_name} ({p.status})
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={onSubmit} disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Create agreement
        </button>
        <Link href="/dashboard/agreements" className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </Card>
  );
}
