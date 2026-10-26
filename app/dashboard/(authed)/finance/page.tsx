import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, PageHeader } from "@/components/dashboard/ui";
import { CategoryBars, FinanceSetupNotice, MoneyChart, MonthNav, StatCard } from "@/components/dashboard/finance/FinanceBits";
import BillsPanel from "@/components/dashboard/finance/BillsPanel";
import EntriesTable from "@/components/dashboard/finance/EntriesTable";
import NewEntry from "@/components/dashboard/finance/NewEntry";
import { byCategory, clientOptions, dueToYou, listBills, loadMoney, monthly, receiptLinks, summarize } from "@/lib/dashboard/finance";
import { pkrRates } from "@/lib/fx-rate";
import { FINANCE_CURRENCIES, addMonths, formatPkr, monthPeriod, todayPk } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : todayPk().slice(0, 7);
  const period = monthPeriod(month);
  const yearPeriod = { from: addMonths(`${month}-01`, -11), to: period.to };

  const [{ rows, ready }, due, { bills }, clients, { rates }] = await Promise.all([
    loadMoney(yearPeriod),
    dueToYou(),
    listBills(),
    clientOptions(),
    pkrRates(FINANCE_CURRENCIES),
  ]);
  const monthRows = rows.filter((r) => r.date >= period.from && r.date <= period.to);
  const s = summarize(monthRows);
  const categories = byCategory(monthRows).filter((c) => c.group !== "pass_through");
  const links = await receiptLinks(monthRows);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Money in, money out and what's left — everything in PKR."
        action={<MonthNav month={month} href={(m) => `/dashboard/finance?month=${m}`} />}
      />
      {!ready && <FinanceSetupNotice />}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Income" value={s.revenue} note={`${period.label}${s.invoiceIncome ? ` · ${formatPkr(s.invoiceIncome)} from invoices` : ""}`} />
        <StatCard label="Costs" value={s.direct + s.overhead} note={s.tax ? `+ ${formatPkr(s.tax)} tax` : "Client work + running costs"} />
        <StatCard
          label="Profit"
          value={s.profit}
          tone={s.profit > 0 ? "good" : s.profit < 0 ? "bad" : undefined}
          note={s.margin != null ? `${s.margin}% of money in` : "Before tax"}
        />
        <StatCard
          label="Due to you"
          value={due.pkr}
          tone={due.overdue ? "bad" : undefined}
          note={due.count ? `${due.count} unpaid invoice${due.count === 1 ? "" : "s"}${due.overdue ? ` · ${due.overdue} overdue` : ""}` : "Nothing outstanding"}
        />
      </div>

      {(s.clientMoneyIn > 0 || s.clientAdSpend > 0) && (
        <p className="text-small text-ink-muted mt-4">
          Client money (kept out of profit): received {formatPkr(s.clientMoneyIn)} · spent for them (ads, add-ons) {formatPkr(s.clientAdSpend)}
          {s.clientMoneyHeld > 0 && ` · still holding ${formatPkr(s.clientMoneyHeld)}`}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Card className="p-6 lg:p-8 xl:col-span-2">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="text-body-lg font-semibold">Last 12 months</h2>
            <Link href="/dashboard/finance/reports" className="text-small inline-flex items-center gap-1 hover:underline underline-offset-4">
              Reports <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <MoneyChart data={monthly(rows, yearPeriod)} />
        </Card>
        <Card className="p-6 lg:p-8">
          <h2 className="text-body-lg font-semibold mb-5">Where the money went</h2>
          {categories.length ? (
            <CategoryBars items={categories.slice(0, 8).map((c) => ({ label: c.label, pkr: c.pkr }))} />
          ) : (
            <p className="text-small text-ink-muted">No expenses in {period.label}.</p>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <BillsPanel bills={bills} clients={clients} rates={rates} compact />
      </div>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-body-lg font-semibold">{period.label}: money in and out</h2>
          <p className="text-small text-ink-muted mt-1">Invoice payments, other income and expenses, newest first.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <NewEntry kind="income" clients={clients} rates={rates} variant="secondary" />
          <NewEntry kind="expense" clients={clients} rates={rates} />
        </div>
      </div>
      {monthRows.length ? (
        <EntriesTable rows={monthRows} receiptLinks={links} clients={clients} rates={rates} showKind />
      ) : (
        <p className="text-small text-ink-muted">Nothing recorded in {period.label} yet.</p>
      )}
    </>
  );
}
