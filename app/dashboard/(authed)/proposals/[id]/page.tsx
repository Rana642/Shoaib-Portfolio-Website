import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { getSettings } from "@/lib/dashboard/settings";
import { sendProposal, deleteProposal } from "@/lib/dashboard/actions/proposals";
import { StatusBadge } from "@/components/dashboard/ui";
import ProposalPreview from "@/components/dashboard/ProposalPreview";
import ProposalActions from "@/components/dashboard/ProposalActions";
import DeleteButton from "@/components/dashboard/DeleteButton";
import type { Proposal } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: PageProps<"/dashboard/proposals/[id]">) {
  const { id } = await params;

  const [{ data: proposal }, { data: itemsData }, settings] = await Promise.all([
    db.from("proposals").select("*").eq("id", id).single(),
    db.from("proposal_items").select("*").eq("proposal_id", id).order("sort_order"),
    getSettings(),
  ]);

  if (!proposal) notFound();

  const items = itemsData ?? [];

  const { data: intake } = await db
    .from("onboarding_intakes")
    .select("id, status")
    .eq("proposal_id", id)
    .maybeSingle();

  async function send() {
    "use server";
    return sendProposal(id);
  }

  async function handleDelete() {
    "use server";
    return deleteProposal(id);
  }

  return (
    <>
      <div className="print:hidden">
        <Link
          href="/dashboard/proposals"
          className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
          All proposals
        </Link>

        <div className="flex flex-wrap items-center gap-4 mb-6">
          <h1 className="font-serif italic text-h2">{proposal.number}</h1>
          <StatusBadge status={(proposal as Proposal).status} />
        </div>

        {intake && (
          <Link
            href="/dashboard/onboarding"
            className="inline-flex items-center gap-2 text-small bg-cobalt/8 border border-cobalt/20 rounded-lg px-4 py-2.5 mb-6 hover:border-cobalt/40 transition-colors"
          >
            <Users className="size-4 text-cobalt" aria-hidden />
            Onboarding {intake.status === "submitted" ? "submitted" : "invite sent"}
          </Link>
        )}

        <div className="mb-8">
          <ProposalActions
            editHref={`/dashboard/proposals/${id}/edit`}
            status={(proposal as Proposal).status}
            onSend={send}
          />
        </div>
      </div>

      <ProposalPreview proposal={proposal as Proposal} items={items} settings={settings} />

      {(proposal as Proposal).signer_name && (
        <div className="mt-6 text-small text-ink-muted print:hidden">
          Accepted and signed by <span className="font-medium text-ink">{(proposal as Proposal).signer_name}</span>
          {(proposal as Proposal).signed_at &&
            ` on ${new Date((proposal as Proposal).signed_at as string).toLocaleString()}`}
        </div>
      )}

      <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
        <DeleteButton action={handleDelete} label="Delete proposal" />
      </div>
    </>
  );
}
