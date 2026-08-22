import Link from "next/link";
import { Users, FileText, Receipt, Inbox, ArrowRight } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { PageHeader, Card, StatusBadge, EmptyState, LinkButton } from "@/components/dashboard/ui";
import type { Invoice, Quotation } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

type InvoiceWithClient = Invoice & { clients: { name: string } | null };
type QuotationWithClient = Quotation & { clients: { name: string } | null };

async function getOverview() {
  const [clients, quotations, invoices, leads, recentInvoices, recentQuotations] =
    await Promise.all([
      db.from("clients").select("id", { count: "exact", head: true }).eq("is_active", true),
      db.from("quotations").select("id", { count: "exact", head: true }),
      db.from("invoices").select("id", { count: "exact", head: true }),
      db.from("contacts").select("id", { count: "exact", head: true }),
      db
        .from("invoices")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(5),
      db
        .from("quotations")
        .select("*, clients(name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  // Outstanding = everything invoiced but not yet collected, grouped by
  // currency — mixing PKR and USD into one number would be meaningless.
  const { data: unpaid } = await db
    .from("invoices")
    .select("currency, total, amount_paid")
    .in("status", ["sent", "partially_paid", "overdue"]);

  const outstanding: Record<string, number> = {};
  for (const inv of unpaid ?? []) {
    const due = Number(inv.total) - Number(inv.amount_paid);
    if (due > 0) outstanding[inv.currency] = (outstanding[inv.currency] ?? 0) + due;
  }

  return {
    counts: {
      clients: clients.count ?? 0,
      quotations: quotations.count ?? 0,
      invoices: invoices.count ?? 0,
      leads: leads.count ?? 0,
    },
    outstanding,
    recentInvoices: (recentInvoices.data ?? []) as InvoiceWithClient[],
    recentQuotations: (recentQuotations.data ?? []) as QuotationWithClient[],
  };
}

export default async function DashboardOverview() {
  const { counts, outstanding, recentInvoices, recentQuotations } = await getOverview();

  const stats = [
    { label: "Active clients", value: counts.clients, icon: Users, href: "/dashboard/clients" },
    { label: "Quotations", value: counts.quotations, icon: FileText, href: "/dashboard/quotations" },
    { label: "Invoices", value: counts.invoices, icon: Receipt, href: "/dashboard/invoices" },
    { label: "Leads", value: counts.leads, icon: Inbox, href: "/dashboard/leads" },
  ];

  const outstandingEntries = Object.entries(outstanding);

  return (
    <>
      <PageHeader title="Overview" description="Where the business stands right now." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white border border-ink/10 rounded-xl p-5 hover:border-citrus/50 transition-colors"
          >
            <stat.icon className="size-4 text-cobalt" aria-hidden />
            <p className="font-serif italic text-h3 mt-3 leading-none">{stat.value}</p>
            <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-2">
              {stat.label}
            </p>
          </Link>
        ))}
      </div>

      {outstandingEntries.length > 0 && (
        <Card className="p-6 mt-6">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Outstanding
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-4 mt-4">
            {outstandingEntries.map(([currency, amount]) => (
              <div key={currency}>
                <p className="font-serif italic text-h3 leading-none">
                  {formatMoney(amount, currency)}
                </p>
                <p className="text-small text-ink-subtle mt-1.5">unpaid in {currency}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-body-lg font-semibold">Recent invoices</h2>
            <Link
              href="/dashboard/invoices"
              className="text-small text-ink-muted hover:text-ink inline-flex items-center gap-1"
            >
              All <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-small text-ink-subtle">No invoices yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentInvoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/dashboard/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-4 py-2 group"
                  >
                    <div className="min-w-0">
                      <p className="text-small font-medium group-hover:underline">{inv.number}</p>
                      <p className="text-small text-ink-subtle truncate">
                        {inv.clients?.name ?? "—"} · {formatDate(inv.issue_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-small font-medium">
                        {formatMoney(Number(inv.total), inv.currency)}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-body-lg font-semibold">Recent quotations</h2>
            <Link
              href="/dashboard/quotations"
              className="text-small text-ink-muted hover:text-ink inline-flex items-center gap-1"
            >
              All <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {recentQuotations.length === 0 ? (
            <p className="text-small text-ink-subtle">No quotations yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentQuotations.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/dashboard/quotations/${q.id}`}
                    className="flex items-center justify-between gap-4 py-2 group"
                  >
                    <div className="min-w-0">
                      <p className="text-small font-medium group-hover:underline">{q.number}</p>
                      <p className="text-small text-ink-subtle truncate">
                        {q.clients?.name ?? "—"} · {formatDate(q.issue_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-small font-medium">
                        {formatMoney(Number(q.total), q.currency)}
                      </p>
                      <div className="mt-1">
                        <StatusBadge status={q.status} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {counts.clients === 0 && (
        <div className="mt-6">
          <EmptyState
            title="Start with a client"
            description="Add a client, then build the services catalog — quotations and invoices pull from both."
            action={<LinkButton href="/dashboard/clients/new">Add first client</LinkButton>}
          />
        </div>
      )}
    </>
  );
}
