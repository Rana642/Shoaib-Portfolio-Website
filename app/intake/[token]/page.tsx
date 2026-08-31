import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getIntakeByToken } from "@/lib/dashboard/actions/intakes";
import { isStorageConfigured } from "@/lib/storage";
import IntakeForm from "@/components/dashboard/IntakeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const intake = await getIntakeByToken(token);
  if (!intake) notFound();

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-serif italic text-h3 leading-none mb-2">
          ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
        </p>
        <h1 className="font-serif italic text-h2 mt-6">
          {intake.business_name} — account setup
        </h1>
        <p className="text-body text-ink-muted mt-2 mb-8">
          A few details so I can set your social accounts up properly. Fill in what you can —
          nothing here is mandatory, and you can share files or links for your brand assets.
        </p>

        {intake.status === "submitted" ? (
          <p className="text-body-lg font-medium">
            This has already been submitted — thanks, I&apos;m all set.
          </p>
        ) : (
          <IntakeForm token={token} uploadsEnabled={isStorageConfigured} />
        )}
      </div>
    </main>
  );
}
