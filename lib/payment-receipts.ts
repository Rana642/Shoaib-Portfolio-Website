import "server-only";
import { db } from "./dashboard/db";

/**
 * The invoice a public receipt upload belongs to, if its token is genuine
 * and the invoice can still take a payment (sent / partially paid /
 * overdue, balance left). Drafts and cancelled invoices don't exist for
 * the public; paid ones are closed.
 */
export async function payableInvoice(token: string) {
  if (!/^[a-f0-9]{32,80}$/.test(token)) return { error: "Invalid link.", status: 404 } as const;
  const { data } = await db
    .from("invoices")
    .select("id, number, status, currency, total, amount_paid, client_id, clients(name, email, contact_person)")
    .eq("access_token", token)
    .maybeSingle();
  if (!data || data.status === "draft" || data.status === "cancelled") return { error: "Invalid link.", status: 404 } as const;
  const balance = Number(data.total) - Number(data.amount_paid);
  if (data.status === "paid" || balance <= 0) return { error: "This invoice is already paid.", status: 409 } as const;
  const client = (Array.isArray(data.clients) ? data.clients[0] : data.clients) as { name: string; email: string | null; contact_person: string | null } | null;
  return { invoice: { ...data, balance, client } } as const;
}

export type PayableInvoice = Extract<Awaited<ReturnType<typeof payableInvoice>>, { invoice: unknown }>["invoice"];

/** Storage folder per upload scope: the invoice token, or "pay" for /pay. */
export const receiptPrefix = (scope: string) => `receipts/${scope}/`;
