import "server-only";
import { db } from "./db";
import { isStorageConfigured, presignDownload } from "../storage";
import type { PaymentReceipt } from "./types";

export type ReceiptWithLink = PaymentReceipt & { viewUrl: string | null; clientName: string | null };
export type OpenInvoice = { id: string; number: string; currency: string; balance: number; clientName: string | null };

/** Receipts (pending first, then the latest reviewed), each with a 1-hour
 *  private link to the uploaded file. Empty before the table exists. */
export async function listReceipts(opts: { invoiceId?: string; limit?: number } = {}): Promise<ReceiptWithLink[]> {
  let q = db.from("payment_receipts").select("*, clients(name)").order("created_at", { ascending: false }).limit(opts.limit ?? 80);
  if (opts.invoiceId) q = q.eq("invoice_id", opts.invoiceId);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as (PaymentReceipt & { clients: { name: string } | null })[];
  const withLinks = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      clientName: r.clients?.name ?? null,
      viewUrl: isStorageConfigured ? await presignDownload(r.file_key).catch(() => null) : null,
    }))
  );
  return withLinks.sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
}

export async function pendingReceiptCount(): Promise<number> {
  const { count, error } = await db.from("payment_receipts").select("id", { count: "exact", head: true }).eq("status", "pending");
  return error ? 0 : count ?? 0;
}

/** Invoices that can still take a payment — the "Apply to invoice" choices. */
export async function openInvoices(): Promise<OpenInvoice[]> {
  const { data } = await db
    .from("invoices")
    .select("id, number, currency, total, amount_paid, clients(name)")
    .in("status", ["sent", "partially_paid", "overdue"])
    .order("issue_date", { ascending: false })
    .limit(200);
  return ((data ?? []) as unknown as { id: string; number: string; currency: string; total: number; amount_paid: number; clients: { name: string } | null }[])
    .map((i) => ({ id: i.id, number: i.number, currency: i.currency, balance: Number(i.total) - Number(i.amount_paid), clientName: i.clients?.name ?? null }))
    .filter((i) => i.balance > 0);
}
