import "server-only";
import { db } from "./db";
import { presignDownload } from "../storage";
import { pkrRate, pkrRates } from "../fx-rate";
import {
  categoryLabel,
  expenseGroup,
  INVOICE_PAYMENT_LABEL,
  monthsIn,
  round2,
  todayPk,
  type BillFrequency,
  type EntryKind,
  type ExpenseGroup,
  type Period,
} from "../finance";

/** One line of money in or out — a finance entry or an invoice payment. */
export type MoneyRow = {
  id: string;
  source: "entry" | "payment";
  kind: EntryKind;
  date: string;
  category: string;
  categoryLabel: string;
  group: ExpenseGroup | null;
  party: string | null;
  description: string | null;
  amount: number;
  currency: string;
  fxRate: number | null;
  pkr: number;
  /** A payment saved before PKR amounts existed — converted at that day's rate now. */
  pkrEstimated: boolean;
  clientId: string | null;
  clientName: string | null;
  passThrough: boolean;
  /** Invoice payments: the share that paid for add-ons (domain renewal,
   *  a subscription…) — client money, kept out of income. */
  addonsPkr: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  invoice: { id: string; number: string } | null;
  billId: string | null;
  file: { key: string; name: string | null; type: string | null; size: number | null } | null;
};

export type FinanceBill = {
  id: string;
  name: string;
  vendor: string | null;
  category: string;
  amount: number;
  currency: string;
  frequency: BillFrequency;
  next_due: string;
  client_id: string | null;
  method: string | null;
  is_active: boolean;
  notes: string | null;
  clients: { name: string } | null;
};

/** The finance tables don't exist until the SQL block is run once. */
const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));

type EntryRecord = {
  id: string;
  kind: EntryKind;
  entry_date: string;
  category: string;
  party: string | null;
  description: string | null;
  amount: number;
  currency: string;
  fx_rate: number;
  pkr_amount: number;
  client_id: string | null;
  pass_through: boolean;
  method: string | null;
  bill_id: string | null;
  file_key: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  notes: string | null;
  clients: { name: string } | null;
};

function fromEntry(e: EntryRecord): MoneyRow {
  return {
    id: e.id,
    source: "entry",
    kind: e.kind,
    date: e.entry_date,
    category: e.category,
    categoryLabel: categoryLabel(e.kind, e.category),
    group: e.kind === "expense" ? (e.pass_through ? "pass_through" : expenseGroup(e.category)) : null,
    party: e.party,
    description: e.description,
    amount: Number(e.amount),
    currency: e.currency,
    fxRate: Number(e.fx_rate),
    pkr: Number(e.pkr_amount),
    pkrEstimated: false,
    clientId: e.client_id,
    clientName: e.clients?.name ?? null,
    passThrough: e.pass_through,
    addonsPkr: 0,
    method: e.method,
    reference: null,
    notes: e.notes,
    invoice: null,
    billId: e.bill_id,
    file: e.file_key ? { key: e.file_key, name: e.file_name, type: e.file_type, size: e.file_size } : null,
  };
}

type PaymentRecord = {
  id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  fx_rate?: number | null;
  pkr_amount?: number | null;
  invoices: {
    id: string;
    number: string;
    currency: string;
    client_id: string;
    total?: number | null;
    addons_total?: number | null;
    clients: { name: string } | null;
  } | null;
};

async function loadPayments(period: Pick<Period, "from" | "to">): Promise<MoneyRow[]> {
  const cols = (invoiceExtra: string) =>
    `id, amount, paid_at, method, reference, notes, invoices!inner(id, number, currency, client_id${invoiceExtra}, clients(name))`;
  const query = (select: string) =>
    db.from("payments").select(select).gte("paid_at", period.from).lte("paid_at", period.to).order("paid_at", { ascending: false });
  let res = await query(`${cols(", total, addons_total")}, fx_rate, pkr_amount`);
  // Older databases: no add-on totals yet, or no PKR columns yet.
  if (res.error) res = await query(`${cols("")}, fx_rate, pkr_amount`);
  if (res.error) res = await query(cols(""));
  const payments = (res.data ?? []) as unknown as PaymentRecord[];

  return Promise.all(
    payments.map(async (p) => {
      const inv = p.invoices;
      const currency = inv?.currency ?? "PKR";
      const amount = Number(p.amount);
      let pkr = p.pkr_amount != null ? Number(p.pkr_amount) : null;
      let fxRate = p.fx_rate != null ? Number(p.fx_rate) : null;
      let estimated = false;
      if (pkr == null) {
        fxRate = currency === "PKR" ? 1 : await pkrRate(currency, p.paid_at);
        pkr = round2(amount * (fxRate ?? 0));
        estimated = currency !== "PKR";
      }
      // The add-ons' share of this payment, in proportion to the invoice.
      const invoiceTotal = Number(inv?.total ?? 0);
      const addonsShare = invoiceTotal > 0 ? Math.min(1, Math.max(0, Number(inv?.addons_total ?? 0) / invoiceTotal)) : 0;
      const addonsPkr = round2(pkr * addonsShare);
      return {
        id: p.id,
        source: "payment" as const,
        kind: "income" as const,
        date: p.paid_at,
        category: "invoice_payment",
        categoryLabel: INVOICE_PAYMENT_LABEL,
        group: null,
        party: inv?.clients?.name ?? null,
        description: inv
          ? `Invoice ${inv.number}${addonsPkr > 0 ? ` · add-ons PKR ${addonsPkr.toLocaleString("en-PK")} kept as client money` : ""}`
          : null,
        amount,
        currency,
        fxRate,
        pkr,
        pkrEstimated: estimated,
        clientId: inv?.client_id ?? null,
        clientName: inv?.clients?.name ?? null,
        passThrough: false,
        addonsPkr,
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        invoice: inv ? { id: inv.id, number: inv.number } : null,
        billId: null,
        file: null,
      };
    })
  );
}

/** Every line of money in and out in a period, newest first. `ready` = the Finance tables exist. */
export async function loadMoney(period: Pick<Period, "from" | "to">): Promise<{ rows: MoneyRow[]; ready: boolean }> {
  const [entries, payments] = await Promise.all([
    db
      .from("finance_entries")
      .select("*, clients(name)")
      .gte("entry_date", period.from)
      .lte("entry_date", period.to)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    loadPayments(period),
  ]);
  const ready = !isMissingTable(entries.error);
  const rows = [...((entries.data ?? []) as EntryRecord[]).map(fromEntry), ...payments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { rows, ready };
}

export type Summary = {
  /** Invoice payments received. */
  invoiceIncome: number;
  /** Other income that's yours (affiliate commission, payments without an invoice…). */
  otherIncome: number;
  /** A client's own money received (their ad budget, or add-ons they paid back). */
  clientMoneyIn: number;
  /** Of that: the add-ons' share of invoice payments. */
  addonsIn: number;
  /** A client's money spent for them (their ads). */
  clientAdSpend: number;
  /** Client money received but not spent yet — not income. */
  clientMoneyHeld: number;
  /** Fees you earned: income minus any client ad spend that was billed inside an invoice. */
  revenue: number;
  direct: number;
  overhead: number;
  grossProfit: number;
  /** Profit before tax. */
  profit: number;
  tax: number;
  afterTax: number;
  moneyIn: number;
  moneyOut: number;
  margin: number | null;
};

/**
 * The profit & loss maths. Client money (pass-through) stays out of profit:
 * ad budget received as "client ad budget" covers the ad spend; if more was
 * spent than received that way, the rest was billed inside an invoice, so it
 * comes off the invoice income instead.
 */
export function summarize(rows: MoneyRow[]): Summary {
  let invoiceIncome = 0,
    otherIncome = 0,
    clientMoneyIn = 0,
    addonsIn = 0,
    clientAdSpend = 0,
    direct = 0,
    overhead = 0,
    tax = 0;
  for (const r of rows) {
    if (r.kind === "income") {
      if (r.source === "payment") {
        // Add-ons billed on the invoice are the client's money, not income.
        invoiceIncome += r.pkr - r.addonsPkr;
        clientMoneyIn += r.addonsPkr;
        addonsIn += r.addonsPkr;
      }
      else if (r.passThrough) clientMoneyIn += r.pkr;
      else otherIncome += r.pkr;
    } else if (r.passThrough || r.group === "pass_through") clientAdSpend += r.pkr;
    else if (r.group === "direct") direct += r.pkr;
    else if (r.group === "tax") tax += r.pkr;
    else overhead += r.pkr;
  }
  const clientNet = clientMoneyIn - clientAdSpend;
  const revenue = invoiceIncome + otherIncome + Math.min(0, clientNet);
  const grossProfit = revenue - direct;
  const profit = grossProfit - overhead;
  return {
    invoiceIncome: round2(invoiceIncome),
    otherIncome: round2(otherIncome),
    clientMoneyIn: round2(clientMoneyIn),
    addonsIn: round2(addonsIn),
    clientAdSpend: round2(clientAdSpend),
    clientMoneyHeld: round2(Math.max(0, clientNet)),
    revenue: round2(revenue),
    direct: round2(direct),
    overhead: round2(overhead),
    grossProfit: round2(grossProfit),
    profit: round2(profit),
    tax: round2(tax),
    afterTax: round2(profit - tax),
    moneyIn: round2(invoiceIncome + otherIncome + clientMoneyIn),
    moneyOut: round2(direct + overhead + tax + clientAdSpend),
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
  };
}

/** Month by month (oldest first) for the chart and the report table. */
export function monthly(rows: MoneyRow[], period: Pick<Period, "from" | "to">) {
  return monthsIn(period).map((month) => {
    const s = summarize(rows.filter((r) => r.date.startsWith(month)));
    return { month, moneyIn: s.moneyIn, moneyOut: s.moneyOut, revenue: s.revenue, costs: round2(s.direct + s.overhead), profit: s.profit };
  });
}

/** Expenses by category, biggest first. */
export function byCategory(rows: MoneyRow[]) {
  const map = new Map<string, { category: string; label: string; group: ExpenseGroup; pkr: number; count: number }>();
  for (const r of rows) {
    if (r.kind !== "expense") continue;
    const cur = map.get(r.category) ?? { category: r.category, label: r.categoryLabel, group: r.group ?? "overhead", pkr: 0, count: 0 };
    cur.pkr += r.pkr;
    cur.count += 1;
    map.set(r.category, cur);
  }
  return [...map.values()].map((c) => ({ ...c, pkr: round2(c.pkr) })).sort((a, b) => b.pkr - a.pkr);
}

/** Profit per client: what they paid you, minus their ad spend and the costs tagged to them. */
export function byClient(rows: MoneyRow[]) {
  const map = new Map<string, MoneyRow[]>();
  for (const r of rows) {
    if (!r.clientId) continue;
    map.set(r.clientId, [...(map.get(r.clientId) ?? []), r]);
  }
  return [...map.entries()]
    .map(([clientId, list]) => {
      const s = summarize(list);
      return {
        clientId,
        name: list.find((r) => r.clientName)?.clientName ?? "Client",
        income: round2(s.invoiceIncome + s.otherIncome),
        clientAdSpend: s.clientAdSpend,
        costs: round2(s.direct + s.overhead),
        profit: s.profit,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

/** Money in by where it came from: PKR invoices (local) vs other currencies (foreign remittances). */
export function incomeByOrigin(rows: MoneyRow[]) {
  let local = 0,
    foreign = 0;
  for (const r of rows) {
    if (r.kind !== "income" || r.passThrough) continue;
    const own = r.pkr - r.addonsPkr;
    if (r.currency === "PKR") local += own;
    else foreign += own;
  }
  return { local: round2(local), foreign: round2(foreign) };
}

/** What clients still owe on sent invoices, in PKR at today's rates. */
export async function dueToYou(): Promise<{ pkr: number; count: number; overdue: number }> {
  const { data } = await db
    .from("invoices")
    .select("currency, total, amount_paid, status, due_date")
    .in("status", ["sent", "partially_paid", "overdue"]);
  const list = (data ?? []) as { currency: string; total: number; amount_paid: number; status: string; due_date: string | null }[];
  if (list.length === 0) return { pkr: 0, count: 0, overdue: 0 };
  const { rates } = await pkrRates([...new Set(list.map((i) => i.currency))]);
  const today = todayPk();
  let pkr = 0,
    overdue = 0;
  for (const i of list) {
    const balance = Number(i.total) - Number(i.amount_paid);
    if (balance <= 0) continue;
    pkr += balance * (rates[i.currency] ?? 0);
    if (i.status === "overdue" || (i.due_date && i.due_date < today)) overdue += 1;
  }
  return { pkr: round2(pkr), count: list.length, overdue };
}

export async function listBills(): Promise<{ bills: FinanceBill[]; ready: boolean }> {
  const { data, error } = await db.from("finance_bills").select("*, clients(name)").order("is_active", { ascending: false }).order("next_due");
  return { bills: (data ?? []) as FinanceBill[], ready: !isMissingTable(error) };
}

export async function clientOptions(): Promise<{ id: string; name: string }[]> {
  const { data } = await db.from("clients").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

/** 1-hour private links to the receipts attached to these rows. */
export async function receiptLinks(rows: MoneyRow[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    rows
      .filter((r) => r.file)
      .map(async (r) => {
        try {
          out[r.id] = await presignDownload(r.file!.key, r.file!.name ?? undefined);
        } catch {
          /* storage not configured — no link */
        }
      })
  );
  return out;
}
