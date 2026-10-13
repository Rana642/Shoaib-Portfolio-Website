/**
 * Where clients send money (Settings → Payment accounts). Two blocks: the
 * Pakistan (PKR) business account and an international one. Until there is a
 * separate international account, "same as Pakistan" sends international
 * payers to the Pakistan account's IBAN (+ SWIFT). Shown on every invoice
 * link and on /pay — nothing here is secret, but it is Shoaib's own data, so
 * it's only ever typed in by him in the dashboard, never hard-coded.
 */

export type BankAccount = {
  title?: string;
  bank?: string;
  account?: string;
  iban?: string;
  swift?: string;
  branch?: string;
  address?: string;
};

export type PaymentAccounts = {
  pk: BankAccount;
  intl: BankAccount & { sameAsPk?: boolean };
  note?: string;
};

const FIELDS: (keyof BankAccount)[] = ["title", "bank", "account", "iban", "swift", "branch", "address"];

function clean(raw: unknown): BankAccount {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: BankAccount = {};
  for (const f of FIELDS) {
    const v = typeof src[f] === "string" ? (src[f] as string).trim() : "";
    if (v) out[f] = v.slice(0, 200);
  }
  return out;
}

export function normalizePaymentAccounts(raw: unknown): PaymentAccounts {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const intlSrc = src.intl && typeof src.intl === "object" ? (src.intl as Record<string, unknown>) : {};
  const note = typeof src.note === "string" ? src.note.trim().slice(0, 500) : "";
  return {
    pk: clean(src.pk),
    intl: { ...clean(src.intl), sameAsPk: intlSrc.sameAsPk === true },
    ...(note ? { note } : {}),
  };
}

const hasAccount = (a: BankAccount) => Boolean(a.account || a.iban);

export type PaymentRow = { label: string; value: string; copy: boolean };
export type PaymentBlock = { key: "pk" | "intl"; heading: string; rows: PaymentRow[] };

function rowsFor(a: BankAccount, opts: { swift: boolean; account: boolean }): PaymentRow[] {
  const rows: PaymentRow[] = [];
  if (a.title) rows.push({ label: "Account title", value: a.title, copy: true });
  if (a.bank) rows.push({ label: "Bank", value: a.bank, copy: false });
  if (opts.account && a.account) rows.push({ label: "Account number", value: a.account, copy: true });
  if (a.iban) rows.push({ label: "IBAN", value: a.iban, copy: true });
  if (opts.swift && a.swift) rows.push({ label: "SWIFT / BIC", value: a.swift, copy: true });
  if (a.branch) rows.push({ label: "Branch", value: a.branch, copy: false });
  if (opts.swift && a.address) rows.push({ label: "Bank address", value: a.address, copy: false });
  return rows;
}

function pkBlock(p: PaymentAccounts): PaymentBlock | null {
  if (!hasAccount(p.pk)) return null;
  return { key: "pk", heading: "Pakistan (PKR)", rows: rowsFor(p.pk, { swift: false, account: true }) };
}

function intlBlock(p: PaymentAccounts): PaymentBlock | null {
  if (p.intl.sameAsPk || !hasAccount(p.intl)) {
    // international payers use the Pakistan account's IBAN (an account number alone can't receive a SWIFT transfer)
    if (!p.pk.iban) return null;
    const a: BankAccount = { title: p.pk.title, bank: p.pk.bank, iban: p.pk.iban, swift: p.intl.swift || p.pk.swift, address: p.intl.address || p.pk.address };
    return { key: "intl", heading: "International", rows: rowsFor(a, { swift: true, account: false }) };
  }
  return { key: "intl", heading: "International", rows: rowsFor(p.intl, { swift: true, account: true }) };
}

/** The account block(s) to show: PKR → Pakistan, any other currency →
 *  International, no currency (the /pay page) → both. Falls back to whichever
 *  block exists, so a payer is never left without details. */
export function paymentBlocks(p: PaymentAccounts, currency?: string | null): PaymentBlock[] {
  const pk = pkBlock(p), intl = intlBlock(p);
  if (!currency) return [pk, intl].filter((b): b is PaymentBlock => Boolean(b));
  const want = currency.toUpperCase() === "PKR" ? pk : intl;
  const other = currency.toUpperCase() === "PKR" ? intl : pk;
  const pick = want ?? other;
  return pick ? [pick] : [];
}

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const PAY_CURRENCIES = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "CAD", "AUD"];
