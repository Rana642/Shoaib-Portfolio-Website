/** Currency-aware money formatting. Falls back to a plain code + amount
 *  for anything Intl doesn't recognise, rather than throwing. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const groupedNumber = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** Thousands-comma'd whole number (1,284) — for tables and tooltips. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return groupedNumber.format(Math.round(n));
}

/** Stat-tile style: full figure below 10k (1,284), compact above (12.9K, 4.2M). */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.abs(n) < 10_000 ? groupedNumber.format(Math.round(n)) : compactNumber.format(n);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "25 September 2026" — the date as printed on a letter. Parsed as plain
 *  Y/M/D so no timezone can shift it by a day. */
export function formatLetterDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export type Discount = { enabled: boolean; type: "percentage" | "fixed"; value: number };
export type ToolsTax = { enabled: boolean; rate: number };

/**
 * Single source of truth for document maths. Rounds to 2dp at each step
 * so the stored totals always match what the PDF prints — floating-point
 * drift on a financial document is not acceptable.
 *
 * Tools are a fully separate, self-contained bucket: their own subtotal
 * plus their own estimated international-transaction tax, inclusive,
 * added straight into the grand total. Discount and GST apply only to
 * Shoaib's own service fees (`subtotal` below means services only) —
 * neither ever touches the tools figure, since it's a pass-through cost
 * that's already "priced in" by the time it reaches the total, not a
 * discountable part of his fee or something his own GST re-taxes.
 *
 * Proposals treat tools as optional (the client takes them if and when
 * they choose), so they store `servicesTotal` and show it split into
 * `monthlyTotal` (the retainer) and `oneTimeTotal`. Discount and tax are
 * shared out in proportion to each part's subtotal.
 *
 * Add-ons (invoices: domain renewal, a subscription billed back…) are a
 * third bucket. Each one opts in to the discount (`addon_discount`) and to
 * GST (`addon_tax`); otherwise it's billed as-is. With no add-ons every
 * figure is exactly what it was before add-ons existed.
 */
export function calculateTotals(
  allItems: {
    quantity: number;
    rate: number;
    item_type?: "service" | "tool" | "addon";
    billing_type?: "monthly" | "one_time";
    is_complimentary?: boolean;
    addon_discount?: boolean;
    addon_tax?: boolean;
  }[],
  taxEnabled: boolean,
  taxRate: number,
  discount?: Discount,
  toolsTax?: ToolsTax
) {
  // Complimentary lines show their value on the document but are never charged.
  const items = allItems.filter((item) => !item.is_complimentary);
  const amount = (item: { quantity: number; rate: number }) => round2(item.quantity * item.rate);
  const sum = (list: { quantity: number; rate: number }[]) => round2(list.reduce((total, item) => total + amount(item), 0));
  const services = items.filter((item) => (item.item_type ?? "service") === "service");
  const addons = items.filter((item) => item.item_type === "addon");
  const subtotal = sum(services);
  const toolsSubtotal = sum(items.filter((item) => item.item_type === "tool"));
  const addonsSubtotal = sum(addons);
  const discountableAddons = sum(addons.filter((a) => a.addon_discount));

  const discountBase = round2(subtotal + discountableAddons);
  const rawDiscount = !discount?.enabled
    ? 0
    : discount.type === "percentage"
      ? (discountBase * discount.value) / 100
      : discount.value;
  const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), discountBase));
  // The discount is shared between services and the add-ons that opted in.
  const servicesDiscount = discountBase > 0 ? round2((discountAmount * subtotal) / discountBase) : 0;
  const addonsDiscount = round2(discountAmount - servicesDiscount);
  const discountedSubtotal = round2(subtotal - servicesDiscount);

  const taxableAddons = addons
    .filter((a) => a.addon_tax)
    .reduce(
      (total, a) =>
        total + amount(a) - (a.addon_discount && discountableAddons > 0 ? (addonsDiscount * amount(a)) / discountableAddons : 0),
      0
    );
  const servicesTax = taxEnabled ? round2((discountedSubtotal * taxRate) / 100) : 0;
  const addonsTax = taxEnabled ? round2((taxableAddons * taxRate) / 100) : 0;
  const taxAmount = round2(servicesTax + addonsTax);

  const toolsTaxAmount = toolsTax?.enabled ? round2((toolsSubtotal * toolsTax.rate) / 100) : 0;
  const toolsTotal = round2(toolsSubtotal + toolsTaxAmount);
  const addonsTotal = round2(addonsSubtotal - addonsDiscount + addonsTax);
  const servicesTotal = round2(discountedSubtotal + servicesTax);
  const total = round2(servicesTotal + toolsTotal + addonsTotal);
  const monthlySubtotal = sum(services.filter((item) => item.billing_type === "monthly"));
  const monthlyTotal = subtotal > 0 ? round2((servicesTotal * monthlySubtotal) / subtotal) : 0;
  const oneTimeTotal = round2(servicesTotal - monthlyTotal);
  return {
    /** Services only, before the discount. */
    subtotal,
    discountAmount,
    taxAmount,
    toolsSubtotal,
    toolsTaxAmount,
    toolsTotal,
    addonsSubtotal,
    /** Add-ons after their share of the discount, plus their GST. */
    addonsTotal,
    /** Every charged line before the discount and GST — an invoice's "Subtotal". */
    grossSubtotal: round2(subtotal + toolsTotal + addonsSubtotal),
    total,
    servicesTotal,
    monthlyTotal,
    oneTimeTotal,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
