import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAgreementByToken } from "@/lib/dashboard/actions/agreement-public";
import { getSettings } from "@/lib/dashboard/settings";
import AgreementSignForm from "@/components/dashboard/AgreementSignForm";
import AgreementBody from "@/components/dashboard/AgreementBody";
import AgreementHeader from "@/components/dashboard/AgreementHeader";
import { isOfflineSignature, signedOnLabel } from "@/lib/dashboard/offline-dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicAgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [result, settings] = await Promise.all([getAgreementByToken(token), getSettings()]);
  if (!result) notFound();
  const { agreement, proposal, items, projects } = result;

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-ink/10 rounded-xl p-8 md:p-12 print:border-0 print:rounded-none print:p-0">
          <AgreementHeader settings={settings} number={agreement.number} />

          <div className="mt-8">
            <AgreementBody
              content={agreement.content}
              clauses={agreement.clauses}
              proposal={proposal}
              items={items}
              projects={projects}
              wrapped={false}
            />
          </div>

          {agreement.signer_name && (
            <p className="text-small text-ink-muted mt-6">
              Signed by <span className="font-medium text-ink">{agreement.signer_name}</span>
              {agreement.signed_at &&
                ` on ${signedOnLabel(agreement.signed_at, isOfflineSignature(agreement))}`}
            </p>
          )}

          <AgreementSignForm token={token} status={agreement.status} />
        </div>
      </div>
    </main>
  );
}
