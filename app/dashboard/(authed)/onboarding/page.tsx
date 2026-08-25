import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, StatusBadge } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding" };

type IntakeRow = {
  id: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  clients: { name: string } | null;
};

export default async function OnboardingPage() {
  const { data } = await db
    .from("onboarding_intakes")
    .select("id, status, created_at, submitted_at, clients(name)")
    .order("created_at", { ascending: false });

  const intakes = (data ?? []) as unknown as IntakeRow[];

  return (
    <>
      <PageHeader
        title="Onboarding"
        description="Intake forms from clients who've just accepted a proposal."
      />

      {intakes.length === 0 ? (
        <EmptyState
          title="No onboarding invites yet"
          description="These show up automatically once a proposal is accepted."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Client
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden md:table-cell">
                    Invited
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {intakes.map((intake) => (
                  <tr key={intake.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/onboarding/${intake.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                      >
                        {intake.clients?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-small text-ink-muted hidden md:table-cell whitespace-nowrap">
                      {formatDate(intake.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={intake.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
