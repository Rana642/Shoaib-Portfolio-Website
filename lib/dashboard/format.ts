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

/**
 * Single source of truth for document maths. Rounds to 2dp at each step
 * so the stored totals always match what the PDF prints — floating-point
 * drift on a financial document is not acceptable.
 *
 * Order is subtotal -> discount -> tax: the discount is a client-specific
 * break on the work itself, so tax is charged on what they actually pay
 * for it, not the pre-discount price.
 */
export function calculateTotals(
  items: { quantity: number; rate: number }[],
  taxEnabled: boolean,
  taxRate: number,
  discount?: Discount
) {
  const subtotal = round2(
    items.reduce((sum, item) => sum + round2(item.quantity * item.rate), 0)
  );
  const rawDiscount = !discount?.enabled
    ? 0
    : discount.type === "percentage"
      ? (subtotal * discount.value) / 100
      : discount.value;
  const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), subtotal));
  const discountedSubtotal = round2(subtotal - discountAmount);
  const taxAmount = taxEnabled ? round2((discountedSubtotal * taxRate) / 100) : 0;
  const total = round2(discountedSubtotal + taxAmount);
  return { subtotal, discountAmount, taxAmount, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
