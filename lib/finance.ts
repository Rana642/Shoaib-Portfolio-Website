/**
 * Finance (Dashboard → Finance): categories, periods and maths shared by the
 * server pages and the client forms. Money in = invoice payments + "other
 * income" entries; money out = expense entries. Everything is reported in
 * PKR (each row keeps its own rate). Agency rule: a client's own money (their
 * ad budget) is "pass-through" — it never counts as income or cost.
 */

export type EntryKind = "expense" | "income";
/** Where an expense sits in the profit & loss. */
export type ExpenseGroup = "direct" | "overhead" | "tax" | "pass_through";

export type Category = { key: string; label: string; hint?: string };

export const EXPENSE_GROUPS: { key: ExpenseGroup; label: string; hint: string; categories: Category[] }[] = [
  {
    key: "direct",
    label: "Client work costs",
    hint: "What it costs to deliver client work.",
    categories: [
      { key: "freelancers", label: "Freelancers & contractors" },
      { key: "ai_usage", label: "AI & API usage", hint: "OpenAI, Gemini, Topaz…" },
      { key: "client_tools", label: "Tools bought for clients" },
    ],
  },
  {
    key: "overhead",
    label: "Running costs",
    hint: "What it costs to run the business.",
    categories: [
      { key: "software", label: "Software & subscriptions" },
      { key: "hosting", label: "Hosting & domains", hint: "Vercel, Supabase, Hostinger…" },
      { key: "internet_phone", label: "Internet & phone" },
      { key: "equipment", label: "Computer & equipment" },
      { key: "own_marketing", label: "Own marketing & ads" },
      { key: "bank_fees", label: "Bank & payment fees" },
      { key: "office", label: "Office & utilities" },
      { key: "travel", label: "Travel" },
      { key: "learning", label: "Courses & learning" },
      { key: "other_expense", label: "Other" },
    ],
  },
  {
    key: "tax",
    label: "Tax",
    hint: "Shown after profit.",
    categories: [{ key: "tax", label: "Income tax & FBR" }],
  },
  {
    key: "pass_through",
    label: "Client money",
    hint: "Paid with a client's money — not your cost.",
    categories: [
      { key: "client_ad_spend", label: "Client ad spend", hint: "A client's budget paid to Meta, Google…" },
      { key: "client_addons", label: "Client add-ons", hint: "A domain, a subscription… bought for a client and billed back as an invoice add-on" },
    ],
  },
];

export const INCOME_CATEGORIES: (Category & { passThrough?: boolean })[] = [
  { key: "client_payment", label: "Client payment (no invoice)" },
  { key: "affiliate", label: "Affiliate commission", hint: "Hostinger…" },
  { key: "other_income", label: "Other income" },
  { key: "client_ad_budget", label: "Client ad budget", hint: "A client's money to spend on their ads", passThrough: true },
];

/** Invoice payments are money in too, shown with this label. */
export const INVOICE_PAYMENT_LABEL = "Invoice payment";

const EXPENSE_INDEX = new Map(EXPENSE_GROUPS.flatMap((g) => g.categories.map((c) => [c.key, { ...c, group: g.key }] as const)));
const INCOME_INDEX = new Map(INCOME_CATEGORIES.map((c) => [c.key, c] as const));

export function categoryLabel(kind: EntryKind, key: string): string {
  return (kind === "expense" ? EXPENSE_INDEX.get(key)?.label : INCOME_INDEX.get(key)?.label) ?? key;
}

export function expenseGroup(key: string): ExpenseGroup {
  return EXPENSE_INDEX.get(key)?.group ?? "overhead";
}

export function isCategory(kind: EntryKind, key: string): boolean {
  return kind === "expense" ? EXPENSE_INDEX.has(key) : INCOME_INDEX.has(key);
}

/** Categories that are always a client's own money. */
export function isPassThroughCategory(kind: EntryKind, key: string): boolean {
  return kind === "expense" ? expenseGroup(key) === "pass_through" : Boolean(INCOME_INDEX.get(key)?.passThrough);
}

export const FINANCE_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "SEK", "CAD", "AUD"] as const;

export const PAYMENT_METHODS = ["Bank transfer", "Card", "Cash", "JazzCash / Easypaisa", "Wise / Payoneer", "PayPal"] as const;

export const BILL_FREQUENCIES = [
  { key: "monthly", label: "Every month", months: 1 },
  { key: "quarterly", label: "Every 3 months", months: 3 },
  { key: "yearly", label: "Every year", months: 12 },
] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number]["key"];

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

// ── Dates (all plain YYYY-MM-DD strings, so no timezone can shift a day) ──

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Today in Pakistan (the business runs on PKT, UTC+5). */
export function todayPk(): string {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Adds months, keeping the day where possible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysIn(ny, nm)));
}

export function nextDue(date: string, frequency: BillFrequency): string {
  return addMonths(date, BILL_FREQUENCIES.find((f) => f.key === frequency)?.months ?? 1);
}

export type Period = { from: string; to: string; label: string };

export function monthPeriod(month: string): Period {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)), label };
}

/** Pakistan's tax year runs 1 July – 30 June and is named after the year it ends in. */
export function taxYearPeriod(endYear: number): Period {
  return { from: ymd(endYear - 1, 7, 1), to: ymd(endYear, 6, 30), label: `Tax year ${endYear} (Jul ${endYear - 1} – Jun ${endYear})` };
}

export function taxYearOf(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return m >= 7 ? y + 1 : y;
}

/** The report presets, newest first. */
export function presetPeriods(today = todayPk()): { key: string; period: Period }[] {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = ymd(y, m, 1).slice(0, 7);
  const lastMonth = addMonths(ymd(y, m, 1), -1).slice(0, 7);
  const q = Math.floor((m - 1) / 3);
  const qFrom = ymd(y, q * 3 + 1, 1);
  const ty = taxYearOf(today);
  return [
    { key: "this-month", period: { ...monthPeriod(thisMonth), label: "This month" } },
    { key: "last-month", period: { ...monthPeriod(lastMonth), label: "Last month" } },
    { key: "this-quarter", period: { from: qFrom, to: ymd(y, q * 3 + 3, daysIn(y, q * 3 + 3)), label: "This quarter" } },
    { key: "last-12", period: { from: addMonths(ymd(y, m, 1), -11), to: monthPeriod(thisMonth).to, label: "Last 12 months" } },
    { key: "tax-year", period: { ...taxYearPeriod(ty), label: `Tax year ${ty}` } },
    { key: "last-tax-year", period: { ...taxYearPeriod(ty - 1), label: `Tax year ${ty - 1}` } },
    { key: "this-year", period: { from: ymd(y, 1, 1), to: ymd(y, 12, 31), label: `${y}` } },
  ];
}

/** "2026-10" → "Oct 26" for chart labels. */
export function shortMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })} ${String(y).slice(2)}`;
}

/** Every month (YYYY-MM) a period touches. */
export function monthsIn(period: Pick<Period, "from" | "to">): string[] {
  const out: string[] = [];
  let cur = `${period.from.slice(0, 7)}-01`;
  while (cur.slice(0, 7) <= period.to.slice(0, 7)) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return out;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole rupees with commas: "PKR 125,000" (and "−PKR 4,500" for a loss). */
export function formatPkr(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}PKR ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(n)))}`;
}
