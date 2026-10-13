import Link from "next/link";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { FinanceSetupNotice, MonthNav } from "@/components/dashboard/finance/FinanceBits";
import BillsPanel from "@/components/dashboard/finance/BillsPanel";
import EntriesTable from "@/components/dashboard/finance/EntriesTable";
import NewEntry from "@/components/dashboard/finance/NewEntry";
import { clientOptions, listBills, loadMoney, receiptLinks } from "@/lib/dashboard/finance";
import { pkrRates } from "@/lib/fx-rate";
import { EXPENSE_GROUPS, FINANCE_CURRENCIES, formatPkr, monthPeriod, todayPk } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; category?: string; client?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : todayPk().slice(0, 7);
  const period = monthPeriod(month);

  const [{ rows, ready }, { bills }, clients, { rates }] = await Promise.all([
    loadMoney(period),
    listBills(),
    clientOptions(),
    pkrRates(FINANCE_CURRENCIES),
  ]);
  const expenses = rows
    .filter((r) => r.kind === "expense")
    .filter((r) => !sp.category || r.category === sp.category)
    .filter((r) => !sp.client || r.clientId === sp.client);
  const links = await receiptLinks(expenses);
  const total = expenses.reduce((sum, r) => sum + r.pkr, 0);

  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const next = { month, category: sp.category, client: sp.client, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `/dashboard/finance/expenses?${q}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-small whitespace-nowrap", active ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5");
  const usedCategories = EXPENSE_GROUPS.flatMap((g) => g.categories).filter((c) => rows.some((r) => r.kind === "expense" && r.category === c.key));

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Everything the business pays for — tag a client to see what each client really costs."
        action={<MonthNav month={month} href={(m) => href({ month: m })} />}
      />
      {!ready && <FinanceSetupNotice />}

      <div className="mb-6">
        <NewEntry key={`new-${sp.new ?? ""}`} kind="expense" clients={clients} rates={rates} startOpen={sp.new === "expense"} />
      </div>

      <div className="mb-8">
        <BillsPanel key={`bill-${sp.new ?? ""}`} bills={bills} clients={clients} rates={rates} startAdding={sp.new === "bill"} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-body-lg font-semibold">{period.label}</h2>
          <p className="text-small text-ink-muted mt-1">
            {expenses.length} expense{expenses.length === 1 ? "" : "s"} · {formatPkr(total)}
          </p>
        </div>
        {(usedCategories.length > 1 || sp.category) && (
          <div className="flex flex-wrap gap-2">
            <Link href={href({ category: undefined })} className={chip(!sp.category)}>
              All
            </Link>
            {usedCategories.map((c) => (
              <Link key={c.key} href={href({ category: c.key })} className={chip(sp.category === c.key)}>
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {expenses.length ? (
        <EntriesTable rows={expenses} receiptLinks={links} clients={clients} rates={rates} />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-small text-ink-muted">No expenses in {period.label}{sp.category ? " in this category" : ""}.</p>
        </Card>
      )}
    </>
  );
}
