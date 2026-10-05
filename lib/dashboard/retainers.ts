import { db } from "./db";
import { generateNumber } from "./numbering";
import { calculateTotals, round2 } from "./format";
import type { Retainer, RetainerItem } from "./types";

/**
 * Monthly retainers — see docs/RETAINER-BILLING-PLAN.md.
 *
 * A retainer is created from an accepted proposal's MONTHLY lines (services
 * + monthly tools). On the 1st of every month it becomes a DRAFT invoice
 * for that month, which Shoaib reviews and sends. Ad spend is never billed
 * here — clients pay Google/Meta directly.
 *
 * Deliberately not a "use server" file: these helpers are called from the
 * proposal-acceptance cascade, the billing cron and authed actions; exporting
 * them as server actions would make them public endpoints.
 */

/** 'YYYY-MM-DD' of the 1st of the month after `day`. */
export function firstOfNextMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** 'YYYY-MM' → 'November 2026'. */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Today in Pakistan time, 'YYYY-MM-DD' — billing days follow PKT, not UTC. */
export function todayPkt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Proposal project names by id — only when the proposal covers 2+
 *  projects, where otherwise identical lines would be indistinguishable. */
async function projectNames(proposalId: string): Promise<Map<string, string>> {
  const { data } = await db.from("proposal_projects").select("id, name").eq("proposal_id", proposalId);
  return (data ?? []).length > 1 ? new Map(data!.map((p) => [p.id, p.name])) : new Map();
}

function withProject(description: string, projectId: string | null, names: Map<string, string>) {
  const name = projectId ? names.get(projectId) : undefined;
  return name ? `${name}: ${description}` : description;
}

type BillLine = {
  description: string;
  quantity: number;
  rate: number;
  item_type: "service" | "tool";
  catalog_item_id?: string | null;
};

type Discount = { type: "percentage" | "fixed"; value: number };

/**
 * Turn lines + discount/tax settings into invoice line rows and stored
 * totals. Invoices have no discount / tools-tax columns, so those become
 * their own visible lines ("Discount", "International transaction tax");
 * GST stays the invoice's tax, charged on discounted services only — the
 * same maths as the proposal (`calculateTotals`). Stored `subtotal` is
 * total − GST, so the invoice's Subtotal + GST = Total always adds up.
 */
export function buildBill(
  lines: BillLine[],
  discount: Discount,
  tax: { enabled: boolean; rate: number },
  toolsTax: { enabled: boolean; rate: number }
) {
  const totals = calculateTotals(
    lines.map((l) => ({ quantity: l.quantity, rate: l.rate, item_type: l.item_type })),
    tax.enabled,
    tax.rate,
    { enabled: discount.value > 0, type: discount.type, value: discount.value },
    { enabled: toolsTax.enabled, rate: toolsTax.rate }
  );

  const rows: { description: string; quantity: number; rate: number; amount: number; catalog_item_id: string | null }[] = [];
  for (const l of lines.filter((x) => x.item_type === "service")) {
    rows.push({ description: l.description, quantity: l.quantity, rate: l.rate, amount: round2(l.quantity * l.rate), catalog_item_id: l.catalog_item_id ?? null });
  }
  if (totals.discountAmount > 0) {
    const label = discount.type === "percentage" ? `Discount (${Number(discount.value)}%)` : "Discount";
    rows.push({ description: label, quantity: 1, rate: -totals.discountAmount, amount: -totals.discountAmount, catalog_item_id: null });
  }
  for (const l of lines.filter((x) => x.item_type === "tool")) {
    rows.push({ description: l.description, quantity: l.quantity, rate: l.rate, amount: round2(l.quantity * l.rate), catalog_item_id: l.catalog_item_id ?? null });
  }
  if (totals.toolsTaxAmount > 0) {
    rows.push({
      description: `International transaction tax on tools (est. ${Number(toolsTax.rate)}%)`,
      quantity: 1,
      rate: totals.toolsTaxAmount,
      amount: totals.toolsTaxAmount,
      catalog_item_id: null,
    });
  }

  return {
    rows,
    taxAmount: totals.taxAmount,
    total: totals.total,
    subtotal: round2(totals.total - totals.taxAmount),
    monthlyTotal: totals.total,
  };
}

/** Monthly amount of a retainer (what each month's invoice totals). */
export function retainerMonthlyTotal(retainer: Retainer, items: RetainerItem[]) {
  return buildBill(
    items.filter((i) => i.included !== false).map((i) => ({ description: i.description, quantity: Number(i.quantity), rate: Number(i.rate), item_type: i.item_type })),
    { type: retainer.discount_type, value: Number(retainer.discount_value) },
    { enabled: retainer.tax_enabled, rate: Number(retainer.tax_rate) },
    { enabled: retainer.tools_tax_enabled, rate: Number(retainer.tools_tax_rate) }
  ).total;
}

/**
 * Create the retainer for an accepted proposal (idempotent — one per
 * proposal). Copies the proposal's monthly lines; a percentage discount
 * carries over as-is, a fixed one is pro-rated to the monthly share.
 * Returns null when the proposal has no monthly lines.
 */
export async function createRetainerFromProposal(
  proposalId: string,
  options?: { startDate?: string }
): Promise<{ id: string; created: boolean } | null> {
  const { data: existing } = await db.from("retainers").select("id").eq("proposal_id", proposalId).maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const { data: proposal } = await db.from("proposals").select("*").eq("id", proposalId).single();
  if (!proposal || !proposal.client_id) return null;

  const { data: items } = await db.from("proposal_items").select("*").eq("proposal_id", proposalId).order("sort_order");
  const charged = (items ?? []).filter((i) => !i.is_complimentary);
  const monthly = charged.filter((i) => i.billing_type === "monthly");
  if (monthly.length === 0) return null;

  let discountValue = 0;
  if (proposal.discount_enabled && Number(proposal.discount_value) > 0) {
    if (proposal.discount_type === "percentage") {
      discountValue = Number(proposal.discount_value);
    } else {
      const services = charged.filter((i) => i.item_type !== "tool");
      const all = services.reduce((s, i) => s + Number(i.quantity) * Number(i.rate), 0);
      const mon = services.filter((i) => i.billing_type === "monthly").reduce((s, i) => s + Number(i.quantity) * Number(i.rate), 0);
      discountValue = all > 0 ? round2((Number(proposal.discount_value) * mon) / all) : 0;
    }
  }

  const names = await projectNames(proposalId);
  const startDate = options?.startDate ?? todayPkt();
  const { data: retainer, error } = await db
    .from("retainers")
    .insert({
      client_id: proposal.client_id,
      proposal_id: proposal.id,
      name: `${proposal.prospect_business || proposal.prospect_name} — Monthly retainer`,
      status: "active",
      currency: proposal.currency,
      discount_type: proposal.discount_type ?? "percentage",
      discount_value: discountValue,
      tax_enabled: proposal.tax_enabled,
      tax_name: proposal.tax_name ?? "GST",
      tax_rate: proposal.tax_rate ?? 0,
      tools_tax_enabled: proposal.tools_tax_enabled ?? false,
      tools_tax_rate: proposal.tools_tax_rate ?? 18,
      start_date: startDate,
      next_invoice_date: firstOfNextMonth(startDate),
      notes: `Created from proposal ${proposal.number}.`,
    })
    .select("id")
    .single();
  if (error || !retainer) {
    console.error("[retainers] create failed:", error);
    return null;
  }

  await db.from("retainer_items").insert(
    monthly.map((i, index) => ({
      retainer_id: retainer.id,
      catalog_item_id: i.catalog_item_id ?? null,
      description: withProject(i.description, i.project_id, names),
      quantity: i.quantity,
      rate: i.rate,
      item_type: i.item_type === "tool" ? "tool" : "service",
      // Tools are optional for the client — off until ticked on the retainer.
      included: i.item_type !== "tool",
      sort_order: index,
    }))
  );

  return { id: retainer.id, created: true };
}

/**
 * Create the DRAFT invoice a retainer owes for `period` ('YYYY-MM').
 * Idempotent: a unique (retainer_id, period) index makes a second call a
 * no-op. With `includeOneTime`, the proposal's one-time lines are added
 * too (the very first invoice, raised when the agreement is signed).
 */
export async function generateRetainerInvoice(
  retainerId: string,
  period: string,
  options?: { issueDate?: string; includeOneTime?: boolean }
): Promise<{ id: string; number: string; created: boolean } | { error: string }> {
  const { data: existing } = await db
    .from("invoices")
    .select("id, number")
    .eq("retainer_id", retainerId)
    .eq("period", period)
    .maybeSingle();
  if (existing) return { id: existing.id, number: existing.number, created: false };

  const { data: retainer } = await db.from("retainers").select("*").eq("id", retainerId).single();
  if (!retainer) return { error: "Retainer not found." };
  const { data: items } = await db.from("retainer_items").select("*").eq("retainer_id", retainerId).order("sort_order");

  const label = periodLabel(period);
  const lines: BillLine[] = (items ?? []).filter((i) => i.included !== false).map((i) => ({
    description: `${i.description} — ${label}`,
    quantity: Number(i.quantity),
    rate: Number(i.rate),
    item_type: i.item_type,
    catalog_item_id: i.catalog_item_id,
  }));

  let discount: Discount = { type: retainer.discount_type, value: Number(retainer.discount_value) };
  if (options?.includeOneTime && retainer.proposal_id) {
    const { data: proposal } = await db.from("proposals").select("*").eq("id", retainer.proposal_id).single();
    const { data: pItems } = await db
      .from("proposal_items")
      .select("*")
      .eq("proposal_id", retainer.proposal_id)
      .order("sort_order");
    const oneTime = (pItems ?? []).filter((i) => !i.is_complimentary && i.billing_type !== "monthly");
    const names = await projectNames(retainer.proposal_id);
    for (const i of oneTime) {
      lines.push({
        description: `${withProject(i.description, i.project_id, names)} (one-time)`,
        quantity: Number(i.quantity),
        rate: Number(i.rate),
        item_type: i.item_type === "tool" ? "tool" : "service",
        catalog_item_id: i.catalog_item_id ?? null,
      });
    }
    // The first invoice carries the proposal's own discount over everything.
    if (proposal?.discount_enabled) {
      discount = { type: proposal.discount_type, value: Number(proposal.discount_value) };
    }
  }

  if (lines.length === 0) return { error: "This retainer has no lines to bill." };

  const bill = buildBill(
    lines,
    discount,
    { enabled: retainer.tax_enabled, rate: Number(retainer.tax_rate) },
    { enabled: retainer.tools_tax_enabled, rate: Number(retainer.tools_tax_rate) }
  );

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const number = await generateNumber("invoice", settings?.invoice_prefix ?? "INV");
  if (!number) return { error: "Couldn't generate an invoice number." };

  const issueDate = options?.issueDate ?? todayPkt();
  const { data: invoice, error } = await db
    .from("invoices")
    .insert({
      number,
      client_id: retainer.client_id,
      status: "draft",
      issue_date: issueDate,
      due_date: addDays(issueDate, retainer.due_days ?? 7),
      currency: retainer.currency,
      tax_enabled: retainer.tax_enabled,
      tax_name: retainer.tax_name,
      tax_rate: retainer.tax_rate,
      subtotal: bill.subtotal,
      tax_amount: bill.taxAmount,
      total: bill.total,
      notes: options?.includeOneTime
        ? `First invoice: one-time services + monthly retainer for ${label}.`
        : `Monthly retainer — ${label}.`,
      terms: settings?.payment_terms ?? null,
      retainer_id: retainer.id,
      period,
    })
    .select("id")
    .single();
  if (error || !invoice) {
    // A concurrent run may have just created it (unique index) — return that one.
    const { data: race } = await db
      .from("invoices")
      .select("id, number")
      .eq("retainer_id", retainerId)
      .eq("period", period)
      .maybeSingle();
    if (race) return { id: race.id, number: race.number, created: false };
    return { error: error?.message ?? "Couldn't create the invoice." };
  }

  await db.from("invoice_items").insert(
    bill.rows.map((r, index) => ({ invoice_id: invoice.id, ...r, is_complimentary: false, sort_order: index }))
  );

  return { id: invoice.id, number, created: true };
}

export type BillingRunResult = {
  retainer: string;
  clientId: string;
  period: string;
  invoice?: string;
  created?: boolean;
  error?: string;
};

/**
 * The daily billing run (/api/billing/cron). Every ACTIVE retainer whose
 * next_invoice_date has arrived (PKT) gets its DRAFT invoice for that month,
 * then next_invoice_date moves to the following 1st. If the run was missed
 * for a while it catches up month by month (capped, so a stale date can't
 * spray a year of drafts). Idempotent: re-running a day changes nothing.
 */
export async function runRetainerBilling(today = todayPkt()): Promise<BillingRunResult[]> {
  const { data: due } = await db
    .from("retainers")
    .select("id, name, client_id, next_invoice_date, end_date")
    .eq("status", "active")
    .not("next_invoice_date", "is", null)
    .lte("next_invoice_date", today);

  const results: BillingRunResult[] = [];
  for (const r of due ?? []) {
    let next: string = r.next_invoice_date;
    for (let guard = 0; guard < 3 && next <= today; guard++) {
      if (r.end_date && next > r.end_date) break;
      const period = next.slice(0, 7);
      const res = await generateRetainerInvoice(r.id, period, { issueDate: today });
      if ("error" in res) {
        results.push({ retainer: r.name, clientId: r.client_id, period, error: res.error });
        break;
      }
      results.push({ retainer: r.name, clientId: r.client_id, period, invoice: res.number, created: res.created });
      next = firstOfNextMonth(next);
      await db.from("retainers").update({ next_invoice_date: next, updated_at: new Date().toISOString() }).eq("id", r.id);
    }
  }
  return results;
}
