import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { resendAgreement, markAgreementSigned } from "@/lib/dashboard/actions/agreements";
import { siteUrl } from "@/lib/seo";
import { StatusBadge } from "@/components/dashboard/ui";
import AgreementActions from "@/components/dashboard/AgreementActions";
import ConfirmActionButton from "@/components/dashboard/ConfirmActionButton";
import WhatsAppShareLink from "@/components/dashboard/WhatsAppShareLink";
import AgreementBody from "@/components/dashboard/AgreementBody";
import type { Agreement, Proposal } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function AgreementPage({ params }: PageProps<"/dashboard/agreements/[id]">) {
  const { id } = await params;

  const { data } = await db.from("agreements").select("*, clients(name)").eq("id", id).single();
  if (!data) notFound();

  const { clients, ...agreement } = data as Agreement & { clients: { name: string } | null };

  const [{ data: proposal }, { data: items }, { data: projects }] = await Promise.all([
    db.from("proposals").select("*").eq("id", agreement.proposal_id).maybeSingle(),
    db.from("proposal_items").select("*").eq("proposal_id", agreement.proposal_id).order("sort_order"),
    db.from("proposal_projects").select("*").eq("proposal_id", agreement.proposal_id).order("sort_order"),
  ]);

  async function send() {
    "use server";
    return resendAgreement(id);
  }

  async function markSigned(sendEmail: boolean) {
    "use server";
    return markAgreementSigned(id, sendEmail);
  }

  return (
    <>
      <Link
        href="/dashboard/agreements"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6 print:hidden"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All agreements
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1 className="font-serif italic text-h2">{agreement.number}</h1>
        <StatusBadge status={agreement.status} />
      </div>
      <p className="text-small text-ink-muted mb-8">{clients?.name ?? "—"}</p>

      <div className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <AgreementActions
            status={agreement.status}
            onSend={send}
            editHref={agreement.clauses ? `/dashboard/agreements/${id}/edit` : undefined}
          />
          <WhatsAppShareLink
            url={`${siteUrl}/agreement/${agreement.access_token}`}
            message={`Here's your consultation agreement from Ads by Shoaib — ${agreement.number}:`}
          />
        </div>

        {agreement.status !== "signed" && agreement.status !== "declined" && (
          <div className="print:hidden">
            <ConfirmActionButton
              action={markSigned}
              label="Mark signed (confirmed offline)"
              confirmLabel="Click again to confirm signing"
              emailCheckboxLabel="Also email the onboarding invite to the client"
            />
          </div>
        )}
      </div>

      <AgreementBody
        content={agreement.content}
        clauses={agreement.clauses}
        proposal={proposal ? (proposal as Proposal) : null}
        items={items ?? []}
        projects={projects ?? []}
      />

      {agreement.signer_name && (
        <p className="text-small text-ink-muted mt-6">
          Signed by <span className="font-medium text-ink">{agreement.signer_name}</span>
          {agreement.signed_at && ` on ${new Date(agreement.signed_at).toLocaleString()}`}
        </p>
      )}
    </>
  );
}
