import Link from "next/link";
import { Download } from "lucide-react";
import { Card, PageHeader, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { CategoryBars, FinanceSetupNotice } from "@/components/dashboard/finance/FinanceBits";
import { byCategory, byClient, incomeByOrigin, loadMoney, monthly, summarize } from "@/lib/dashboard/finance";
import { formatDate } from "@/lib/dashboard/format";
import { EXPENSE_GROUPS, formatPkr, presetPeriods, shortMonth, type Period } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance reports" };

const th = "font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3";
const td = "px-5 py-3.5 text-small";

function Line({ label, value, strong, minus, note }: { label: string; value: number; strong?: boolean; minus?: boolean; note?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-6 py-2.5", strong && "border-t border-ink/10 font-semibold")}>
      <span className={strong ? "" : "text-ink-muted"}>
        {label}
        {note && <span className="text-tag text-ink-subtle font-normal"> · {note}</span>}
      </span>
      <span className="whitespace-nowrap">{minus && value ? `− ${formatPkr(value)}` : formatPkr(value)}</span>
    </div>
  );
}

export default async function FinanceReportsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const presets = presetPeriods();
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const custom = valid(sp.from) && valid(sp.to) && sp.from! <= sp.to! ? { from: sp.from!, to: sp.to!, label: `${formatDate(sp.from!)} – ${formatDate(sp.to!)}` } : null;
  const preset = presets.find((x) => x.key === sp.p) ?? (custom ? null : presets.find((x) => x.key === "tax-year")!);
  const period: Period = custom ?? preset!.period;

  const { rows, ready } = await loadMoney(period);
  const s = summarize(rows);
  const months = monthly(rows, period);
  const categories = byCategory(rows);
  const clients = byClient(rows);
  const origin = incomeByOrigin(rows);
  const billedAdSpend = s.invoiceIncome + s.otherIncome - s.revenue;
  const groupLabel = Object.fromEntries(EXPENSE_GROUPS.map((g) => [g.key, g.label]));

  return (
    <>
      <PageHeader
        title="Finance reports"
        description="Profit and loss, month by month, by category and by client — for any period. Everything in PKR."
        action={
          <a href={`/api/dashboard/finance/export?from=${period.from}&to=${period.to}`} className={buttonStyles.secondary}>
            <Download className="size-4" aria-hidden />
            Download CSV
          </a>
        }
      />
      {!ready && <FinanceSetupNotice />}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {presets.map((x) => (
          <Link
            key={x.key}
            href={`/dashboard/finance/reports?p=${x.key}`}
            className={cn(
              "rounded-full border px-3 py-1.5 text-small whitespace-nowrap",
              preset?.key === x.key ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:bg-ink/5"
            )}
          >
            {x.period.label}
          </Link>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-3 mb-8" action="/dashboard/finance/reports">
        <label className="text-small">
          <span className="block text-tag text-ink-subtle mb-1">From</span>
          <input type="date" name="from" defaultValue={period.from} className={`${inputClasses} py-1.5`} />
        </label>
        <label className="text-small">
          <span className="block text-tag text-ink-subtle mb-1">To</span>
          <input type="date" name="to" defaultValue={period.to} className={`${inputClasses} py-1.5`} />
        </label>
        <button type="submit" className={`${buttonStyles.secondary} py-2`}>
          Show
        </button>
        <span className="text-small text-ink-muted pb-2">
          {formatDate(period.from)} – {formatDate(period.to)}
        </span>
      </form>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="p-6 lg:p-8">
          <h2 className="text-body-lg font-semibold mb-3">Profit and loss</h2>
          <div className="text-small">
            <Line label="Invoice payments" value={s.invoiceIncome} />
            <Line label="Other income" value={s.otherIncome} />
            {billedAdSpend > 0 && <Line label="Client ad spend billed in invoices" value={billedAdSpend} minus />}
            <Line label="Income" value={s.revenue} strong />
            <Line label="Client work costs" value={s.direct} minus />
            <Line label="Gross profit" value={s.grossProfit} strong />
            <Line label="Running costs" value={s.overhead} minus />
            <Line label="Profit before tax" value={s.profit} strong note={s.margin != null ? `${s.margin}% of income` : undefined} />
            <Line label="Tax paid" value={s.tax} minus />
            <Line label="Profit after tax" value={s.afterTax} strong />
          </div>
          {(s.clientMoneyIn > 0 || s.clientAdSpend > 0) && (
            <p className="text-tag text-ink-subtle mt-4">
              Client money, kept out of profit: received {formatPkr(s.clientMoneyIn)}, spent on their ads {formatPkr(s.clientAdSpend)}
              {s.clientMoneyHeld > 0 ? `, still holding ${formatPkr(s.clientMoneyHeld)}` : ""}.
            </p>
          )}
        </Card>

        <Card className="p-6 lg:p-8">
          <h2 className="text-body-lg font-semibold mb-5">Expenses by category</h2>
          {categories.length ? (
            <CategoryBars items={categories.map((c) => ({ label: c.label, pkr: c.pkr, note: groupLabel[c.group] }))} />
          ) : (
            <p className="text-small text-ink-muted">No expenses in this period.</p>
          )}
        </Card>

        <Card className="p-6 lg:p-8">
          <h2 className="text-body-lg font-semibold mb-1">For your tax adviser</h2>
          <p className="text-tag text-ink-subtle mb-4">Pakistan&apos;s tax year runs July to June. These are your records, not tax advice.</p>
          <div className="text-small">
            <Line label="From Pakistani clients (PKR)" value={origin.local} />
            <Line label="From abroad (other currencies)" value={origin.foreign} note="foreign remittances" />
            <Line label="Business costs" value={s.direct + s.overhead} />
            <Line label="Profit before tax" value={s.profit} strong />
            <Line label="Tax already paid" value={s.tax} />
          </div>
        </Card>
      </div>

      {months.length > 1 && (
        <Card className="overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className={th}>Month</th>
                  <th className={`${th} text-right`}>Income</th>
                  <th className={`${th} text-right`}>Costs</th>
                  <th className={`${th} text-right`}>Profit</th>
                  <th className={`${th} text-right hidden md:table-cell`}>All money in</th>
                  <th className={`${th} text-right hidden md:table-cell`}>All money out</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-ink/5 last:border-0">
                    <td className={td}>
                      <Link href={`/dashboard/finance?month=${m.month}`} className="hover:underline underline-offset-4">
                        {shortMonth(m.month)}
                      </Link>
                    </td>
                    <td className={`${td} text-right`}>{formatPkr(m.revenue)}</td>
                    <td className={`${td} text-right text-ink-muted`}>{formatPkr(m.costs)}</td>
                    <td className={cn(`${td} text-right font-medium`, m.profit < 0 && "text-red-700")}>{formatPkr(m.profit)}</td>
                    <td className={`${td} text-right text-ink-muted hidden md:table-cell`}>{formatPkr(m.moneyIn)}</td>
                    <td className={`${td} text-right text-ink-muted hidden md:table-cell`}>{formatPkr(m.moneyOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <h2 className="text-body-lg font-semibold mt-10 mb-1">Profit per client</h2>
      <p className="text-small text-ink-muted mb-4">What each client paid you, minus their ad spend and the costs you tagged to them. Untagged running costs aren&apos;t split.</p>
      {clients.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-ink/10">
                  <th className={th}>Client</th>
                  <th className={`${th} text-right`}>Paid you</th>
                  <th className={`${th} text-right hidden md:table-cell`}>Their ad spend</th>
                  <th className={`${th} text-right`}>Costs</th>
                  <th className={`${th} text-right`}>Profit</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.clientId} className="border-b border-ink/5 last:border-0">
                    <td className={td}>
                      <Link href={`/dashboard/clients/${c.clientId}`} className="font-medium hover:underline underline-offset-4">
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${td} text-right`}>{formatPkr(c.income)}</td>
                    <td className={`${td} text-right text-ink-muted hidden md:table-cell`}>{formatPkr(c.clientAdSpend)}</td>
                    <td className={`${td} text-right text-ink-muted`}>{formatPkr(c.costs)}</td>
                    <td className={cn(`${td} text-right font-medium`, c.profit < 0 && "text-red-700")}>{formatPkr(c.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-small text-ink-muted">No client payments or tagged costs in this period.</p>
        </Card>
      )}
    </>
  );
}
