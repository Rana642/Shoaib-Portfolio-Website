import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { StatusBadge, Card } from "@/components/dashboard/ui";
import type { OnboardingIntake } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

const fields: { key: keyof OnboardingIntake; label: string }[] = [
  { key: "business_overview", label: "Business overview" },
  { key: "current_channels", label: "Current marketing channels/tools" },
  { key: "goals", label: "Goals" },
  { key: "brand_assets_links", label: "Brand asset links" },
  { key: "access_notes", label: "Access notes" },
  { key: "additional_notes", label: "Additional notes" },
];

export default async function OnboardingIntakePage({
  params,
}: PageProps<"/dashboard/onboarding/[id]">) {
  const { id } = await params;

  const { data } = await db
    .from("onboarding_intakes")
    .select("*, clients(name), proposals(number)")
    .eq("id", id)
    .single();

  if (!data) notFound();

  const { clients, proposals, ...intake } = data as OnboardingIntake & {
    clients: { name: string } | null;
    proposals: { number: string } | null;
  };

  return (
    <>
      <Link
        href="/dashboard/onboarding"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All onboarding
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1 className="font-serif italic text-h2">{clients?.name ?? "—"}</h1>
        <StatusBadge status={intake.status} />
      </div>
      <p className="text-small text-ink-muted mb-8">
        From proposal {proposals?.number ?? "—"} · Invited {formatDate(intake.created_at)}
        {intake.submitted_at && ` · Submitted ${formatDate(intake.submitted_at)}`}
      </p>

      {intake.status === "pending" ? (
        <Card className="p-6">
          <p className="text-body text-ink-muted">
            Waiting on the client to fill this in — nothing to show yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-6 max-w-3xl">
          {fields.map(({ key, label }) =>
            intake[key] ? (
              <Card key={key} className="p-6">
                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                  {label}
                </p>
                <p className="text-body whitespace-pre-line">{String(intake[key])}</p>
              </Card>
            ) : null
          )}
        </div>
      )}
    </>
  );
}
