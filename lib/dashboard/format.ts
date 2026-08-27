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

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
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
 */
export function calculateTotals(
  items: { quantity: number; rate: number; item_type?: "service" | "tool" }[],
  taxEnabled: boolean,
  taxRate: number,
  discount?: Discount,
  toolsTax?: ToolsTax
) {
  const subtotal = round2(
    items
      .filter((item) => item.item_type !== "tool")
      .reduce((sum, item) => sum + round2(item.quantity * item.rate), 0)
  );
  const toolsSubtotal = round2(
    items
      .filter((item) => item.item_type === "tool")
      .reduce((sum, item) => sum + round2(item.quantity * item.rate), 0)
  );
  const rawDiscount = !discount?.enabled
    ? 0
    : discount.type === "percentage"
      ? (subtotal * discount.value) / 100
      : discount.value;
  const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), subtotal));
  const discountedSubtotal = round2(subtotal - discountAmount);
  const taxAmount = taxEnabled ? round2((discountedSubtotal * taxRate) / 100) : 0;
  const toolsTaxAmount = toolsTax?.enabled ? round2((toolsSubtotal * toolsTax.rate) / 100) : 0;
  const toolsTotal = round2(toolsSubtotal + toolsTaxAmount);
  const total = round2(discountedSubtotal + taxAmount + toolsTotal);
  return { subtotal, discountAmount, taxAmount, toolsSubtotal, toolsTaxAmount, toolsTotal, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
