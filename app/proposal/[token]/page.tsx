import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProposalByToken } from "@/lib/dashboard/actions/proposal-public";
import { getSettings } from "@/lib/dashboard/settings";
import ProposalPreview from "@/components/dashboard/ProposalPreview";
import ProposalAcceptForm from "@/components/dashboard/ProposalAcceptForm";

export const dynamic = "force-dynamic";

// Token-gated, one-off document — never indexed, regardless of the site's
// general SITE_IS_LIVE robots default.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [result, settings] = await Promise.all([getProposalByToken(token), getSettings()]);
  if (!result) notFound();

  const { proposal, items } = result;

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <ProposalPreview
          proposal={proposal}
          items={items}
          settings={settings}
          footer={<ProposalAcceptForm token={token} status={proposal.status} />}
        />
      </div>
    </main>
  );
}
