import { Card, PageHeader } from "@/components/dashboard/ui";
import { FinanceSetupNotice, MonthNav, StatCard } from "@/components/dashboard/finance/FinanceBits";
import EntriesTable from "@/components/dashboard/finance/EntriesTable";
import NewEntry from "@/components/dashboard/finance/NewEntry";
import { clientOptions, loadMoney, receiptLinks, summarize } from "@/lib/dashboard/finance";
import { pkrRates } from "@/lib/fx-rate";
import { FINANCE_CURRENCIES, monthPeriod, todayPk } from "@/lib/finance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ month?: string; new?: string }> }) {
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : todayPk().slice(0, 7);
  const period = monthPeriod(month);

  const [{ rows, ready }, clients, { rates }] = await Promise.all([loadMoney(period), clientOptions(), pkrRates(FINANCE_CURRENCIES)]);
  const income = rows.filter((r) => r.kind === "income");
  const s = summarize(rows);
  const links = await receiptLinks(income);

  return (
    <>
      <PageHeader
        title="Income"
        description="Invoice payments come in on their own. Add anything else here — affiliate commission, a client who paid without an invoice."
        action={<MonthNav month={month} href={(m) => `/dashboard/finance/income?month=${m}`} />}
      />
      {!ready && <FinanceSetupNotice />}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="From invoices" value={s.invoiceIncome} note={period.label} />
        <StatCard label="Other income" value={s.otherIncome} note="Commission, payments without an invoice…" />
        <StatCard label="Client money received" value={s.clientMoneyIn} note="Their ad budget — not your income" />
      </div>

      <div className="mb-6">
        <NewEntry key={`new-${sp.new ?? ""}`} kind="income" clients={clients} rates={rates} startOpen={sp.new === "income"} />
      </div>

      {income.length ? (
        <EntriesTable rows={income} receiptLinks={links} clients={clients} rates={rates} />
      ) : (
        <Card className="p-8 text-center">
          <p className="text-small text-ink-muted">No money in during {period.label} yet.</p>
        </Card>
      )}
    </>
  );
}
