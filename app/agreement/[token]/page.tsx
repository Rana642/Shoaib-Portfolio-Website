import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAgreementByToken } from "@/lib/dashboard/actions/agreement-public";
import { getSettings } from "@/lib/dashboard/settings";
import AgreementSignForm from "@/components/dashboard/AgreementSignForm";
import ChargesBreakdown from "@/components/dashboard/ChargesBreakdown";

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
          <div className="flex flex-wrap justify-between gap-8 pb-8 border-b-2 border-citrus">
            <div>
              <p className="font-serif italic text-h3 leading-none">
                {settings.business_name}
                <span className="text-citrus not-italic font-sans">.</span>
              </p>
              <div className="text-small text-ink-muted mt-3 space-y-0.5">
                {settings.business_address && <p>{settings.business_address}</p>}
                {settings.business_email && <p>{settings.business_email}</p>}
                {settings.business_phone && <p>{settings.business_phone}</p>}
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                Agreement
              </p>
              <p className="font-serif italic text-h3 mt-1 leading-none">{agreement.number}</p>
            </div>
          </div>

          {proposal && (
            <div className="mt-8 pb-8 border-b border-ink/10">
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">
                Investment Summary
              </p>
              <ChargesBreakdown proposal={proposal} items={items} projects={projects} />
            </div>
          )}

          <p className="text-body whitespace-pre-line mt-8">{agreement.content}</p>

          {agreement.signer_name && (
            <p className="text-small text-ink-muted mt-6">
              Signed by <span className="font-medium text-ink">{agreement.signer_name}</span>
              {agreement.signed_at && ` on ${new Date(agreement.signed_at).toLocaleString()}`}
            </p>
          )}

          <AgreementSignForm token={token} status={agreement.status} />
        </div>
      </div>
    </main>
  );
}
