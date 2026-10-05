import Link from "next/link";
import { db } from "@/lib/dashboard/db";
import { PageHeader, EmptyState, Card, StatusBadge } from "@/components/dashboard/ui";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { retainerMonthlyTotal } from "@/lib/dashboard/retainers";
import type { Retainer, RetainerItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Retainers" };

export default async function RetainersPage() {
  const { data } = await db
    .from("retainers")
    .select("*, clients(name), retainer_items(*)")
    .order("created_at", { ascending: false });

  const retainers = (data ?? []) as (Retainer & { clients: { name: string } | null; retainer_items: RetainerItem[] })[];

  return (
    <>
      <PageHeader
        title="Retainers"
        description="Monthly billing for accepted proposals. On the 1st of every month each active retainer becomes a draft invoice for you to review and send."
      />

      {retainers.length === 0 ? (
        <EmptyState
          title="No retainers yet"
          description="A retainer is created automatically when a proposal with monthly services is accepted. For an older accepted proposal, open it and choose “Set up monthly retainer”."
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="text-left text-ink-muted border-b border-ink/10">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Retainer</th>
                <th className="px-4 py-3 font-medium text-right">Per month</th>
                <th className="px-4 py-3 font-medium">Next invoice</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {retainers.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]">
                  <td className="px-4 py-3">{r.clients?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/retainers/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMoney(retainerMonthlyTotal(r, r.retainer_items ?? []), r.currency)}
                  </td>
                  <td className="px-4 py-3">{r.status === "active" ? formatDate(r.next_invoice_date) : "—"}</td>
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
