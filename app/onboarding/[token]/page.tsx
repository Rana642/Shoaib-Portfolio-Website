import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getIntakeByToken } from "@/lib/dashboard/actions/onboarding";
import OnboardingIntakeForm from "@/components/dashboard/OnboardingIntakeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PublicOnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const result = await getIntakeByToken(token);
  if (!result) notFound();

  const { intake, clientName } = result;

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-serif italic text-h3 leading-none mb-2">
          ads by shoaib<span className="text-citrus not-italic font-sans font-bold">.</span>
        </p>
        <h1 className="font-serif italic text-h2 mt-6">
          Welcome{clientName ? `, ${clientName}` : ""}
        </h1>
        <p className="text-body text-ink-muted mt-2 mb-8">
          A few details before we start — takes a few minutes.
        </p>

        {intake.status === "submitted" ? (
          <p className="text-body-lg font-medium">
            This has already been submitted — thanks, we&apos;re all set.
          </p>
        ) : (
          <OnboardingIntakeForm token={token} />
        )}
      </div>
    </main>
  );
}
