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

/**
 * Single source of truth for document maths. Rounds to 2dp at each step
 * so the stored totals always match what the PDF prints — floating-point
 * drift on a financial document is not acceptable.
 */
export function calculateTotals(
  items: { quantity: number; rate: number }[],
  taxEnabled: boolean,
  taxRate: number
) {
  const subtotal = round2(
    items.reduce((sum, item) => sum + round2(item.quantity * item.rate), 0)
  );
  const taxAmount = taxEnabled ? round2((subtotal * taxRate) / 100) : 0;
  const total = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
