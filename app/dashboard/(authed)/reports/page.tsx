import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { PageHeader, EmptyState, Card, StatusBadge } from "@/components/dashboard/ui";
import { NewReportForm } from "@/components/dashboard/ReportEditor";
import { createReport } from "@/lib/dashboard/actions/reports";
import { periodLabel, previousPeriod } from "@/lib/dashboard/reports";
import { todayPkt } from "@/lib/dashboard/retainers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const [{ data: reports }, { data: clients }] = await Promise.all([
    db
      .from("client_reports")
      .select("id, period, status, generated_at, clients(name)")
      .order("period", { ascending: false })
      .order("created_at", { ascending: false }),
    db.from("clients").select("id, name").order("name"),
  ]);

  async function create(formData: FormData) {
    "use server";
    return createReport(formData);
  }

  const rows = (reports ?? []) as unknown as {
    id: string;
    period: string;
    status: string;
    clients: { name: string } | null;
  }[];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Monthly client reports: the work log from each project's knowledge base plus that month's ads, website, Google profile and social numbers. A draft is built on the 1st with each retainer invoice."
      />

      <Card className="p-6 mb-8">
        <NewReportForm clients={clients ?? []} defaultPeriod={todayPkt().slice(0, 7)} onCreate={create} />
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No reports yet" description={`Build one above — e.g. ${periodLabel(previousPeriod(todayPkt().slice(0, 7)))} for a client.`} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-ink-muted border-b border-ink/10">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Month</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/reports/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.clients?.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{periodLabel(r.period)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
