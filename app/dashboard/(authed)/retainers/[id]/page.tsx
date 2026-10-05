import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, StatusBadge } from "@/components/dashboard/ui";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { createRetainerInvoiceNow } from "@/lib/dashboard/actions/retainers";
import { periodLabel, todayPkt } from "@/lib/dashboard/retainers";
import RetainerForm, { RetainerInvoiceNow } from "@/components/dashboard/RetainerForm";
import type { Retainer, RetainerItem } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function RetainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: retainer }, { data: items }, { data: invoices }] = await Promise.all([
    db.from("retainers").select("*, clients(name), proposals(id, number)").eq("id", id).single(),
    db.from("retainer_items").select("*").eq("retainer_id", id).order("sort_order"),
    db
      .from("invoices")
      .select("id, number, status, period, issue_date, total, currency")
      .eq("retainer_id", id)
      .order("period", { ascending: false }),
  ]);
  if (!retainer) notFound();

  const r = retainer as Retainer & {
    clients: { name: string } | null;
    proposals: { id: string; number: string } | null;
  };

  async function createInvoice(period: string) {
    "use server";
    return createRetainerInvoiceNow(id, period);
  }

  return (
    <>
      <Link
        href="/dashboard/retainers"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All retainers
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1 className="font-serif italic text-h2">{r.name}</h1>
        <StatusBadge status={r.status} />
      </div>
      <p className="text-small text-ink-muted mb-8">
        {r.clients?.name}
        {r.proposals && (
          <>
            {" · from "}
            <Link href={`/dashboard/proposals/${r.proposals.id}`} className="underline underline-offset-4">
              {r.proposals.number}
            </Link>
          </>
        )}
        {" · started "}
        {formatDate(r.start_date)}
        {r.end_date && ` · ended ${formatDate(r.end_date)}`}
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
        <RetainerForm retainer={r} items={(items ?? []) as RetainerItem[]} />

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-body-lg font-medium mb-1">Invoices</h2>
            <p className="text-small text-ink-muted mb-4">
              A draft is created on the 1st of every month. Review it, then send.
            </p>
            {(invoices ?? []).length === 0 ? (
              <p className="text-small text-ink-subtle">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {(invoices ?? []).map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-small hover:text-ink"
                    >
                      <span className="inline-flex items-center gap-2">
                        <FileText className="size-4 text-ink-subtle" aria-hidden />
                        <span>
                          <span className="font-medium">{inv.period ? periodLabel(inv.period) : inv.number}</span>
                          <span className="block text-tag text-ink-subtle">{inv.number}</span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono">{formatMoney(Number(inv.total), inv.currency)}</span>
                        <StatusBadge status={inv.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="text-body-lg font-medium mb-1">Bill a month now</h2>
            <p className="text-small text-ink-muted mb-4">
              Creates the draft for that month straight away. Picking a month that already has an invoice just opens it.
            </p>
            <RetainerInvoiceNow defaultPeriod={(r.next_invoice_date ?? todayPkt()).slice(0, 7)} action={createInvoice} />
          </Card>
        </div>
      </div>
    </>
  );
}
