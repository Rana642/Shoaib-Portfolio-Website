import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, EmptyState, StatusBadge, LinkButton } from "@/components/dashboard/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client intakes" };

type IntakeRow = {
  id: string;
  business_name: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
};

export default async function IntakesPage() {
  const { data } = await db
    .from("client_intakes")
    .select("id, business_name, status, created_at, submitted_at")
    .order("created_at", { ascending: false });

  const intakes = (data ?? []) as IntakeRow[];

  return (
    <>
      <PageHeader
        title="Client intakes"
        description="On-demand info requests — send a client a link to collect their business details, competitors, and brand assets before setting up their accounts."
        action={<LinkButton href="/dashboard/intakes/new">New intake</LinkButton>}
      />

      {intakes.length === 0 ? (
        <EmptyState
          title="No intakes yet"
          description="Create one, share the link over email or WhatsApp, and the client's answers land right here."
          action={<LinkButton href="/dashboard/intakes/new">New intake</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3">
                    Business
                  </th>
                  <th className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3 hidden md:table-cell">
                    Created
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
                        href={`/dashboard/intakes/${intake.id}`}
                        className="font-medium hover:underline decoration-citrus decoration-2 underline-offset-4"
                      >
                        {intake.business_name}
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
