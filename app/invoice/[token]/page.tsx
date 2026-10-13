import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/dashboard/db";
import { getAdminUser } from "@/lib/dashboard/auth";
import { getPaymentAccounts, getSettings } from "@/lib/dashboard/settings";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import { paymentBlocks } from "@/lib/payment-accounts";
import DocumentPreview from "@/components/dashboard/DocumentPreview";
import PrintButton from "@/components/report/PrintButton";
import HowToPay from "@/components/pay/HowToPay";
import ReceiptUploadForm from "@/components/pay/ReceiptUploadForm";
import type { Client, Invoice, LineItem, PaymentReceipt } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

// Token-gated client document — never indexed.
export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

const RECEIPT_LABEL: Record<PaymentReceipt["status"], { text: string; cls: string }> = {
  pending: { text: "Waiting for confirmation", cls: "bg-citrus/20 border-citrus/50 text-ink" },
  confirmed: { text: "Confirmed", cls: "bg-green-500/10 border-green-600/25 text-green-700" },
  rejected: { text: "Not confirmed", cls: "bg-red-500/10 border-red-600/25 text-red-700" },
};

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,80}$/.test(token)) notFound();

  const { data } = await db.from("invoices").select("*, clients(*)").eq("access_token", token).maybeSingle();
  if (!data) notFound();
  const invoice = data as Invoice & { clients: Client };

  // Drafts (and cancelled invoices) exist only for Shoaib.
  if ((invoice.status === "draft" || invoice.status === "cancelled") && !(await getAdminUser())) notFound();

  const [{ data: items }, settings, accounts, { data: receiptRows }] = await Promise.all([
    db.from("invoice_items").select("*").eq("invoice_id", invoice.id).order("sort_order"),
    getSettings(),
    getPaymentAccounts(),
    // tolerated before the payment_receipts table exists (error → no rows)
    db
      .from("payment_receipts")
      .select("id, created_at, amount, currency, paid_on, status, reject_reason")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: false }),
  ]);
  const balance = Number(invoice.total) - Number(invoice.amount_paid);
  const paid = invoice.status === "paid" || balance <= 0;
  const payable = !paid && invoice.status !== "draft" && invoice.status !== "cancelled";
  const receipts = (receiptRows ?? []) as Pick<PaymentReceipt, "id" | "created_at" | "amount" | "currency" | "paid_on" | "status" | "reject_reason">[];
  const blocks = paymentBlocks(accounts, invoice.currency);

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
          <p className={`text-small font-medium ${paid ? "text-green-700" : "text-ink"}`}>
            {paid
              ? "Paid. Thank you."
              : `Balance due: ${formatMoney(balance, invoice.currency)}${invoice.due_date ? ` by ${formatDate(invoice.due_date)}` : ""}`}
          </p>
          <PrintButton />
        </div>

        {payable && (
          <section className="grid gap-5 mb-8 print:hidden" aria-label="Pay this invoice">
            <HowToPay blocks={blocks} note={accounts.note} />
            {receipts.length > 0 && (
              <div className="rounded-xl border border-ink/10 bg-white p-6">
                <h2 className="text-body-lg font-semibold mb-4">Receipts you sent</h2>
                <ul className="space-y-3">
                  {receipts.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-ink/5 last:border-0 last:pb-0">
                      <div>
                        <p className="text-small font-medium">{formatMoney(Number(r.amount), r.currency)}</p>
                        <p className="text-tag text-ink-subtle">Paid {formatDate(r.paid_on)} · sent {formatDate(r.created_at)}</p>
                        {r.status === "rejected" && r.reject_reason && (
                          <p className="text-small text-red-700 mt-1">{r.reject_reason}</p>
                        )}
                      </div>
                      <span className={`font-mono uppercase text-tag tracking-widest border rounded-full px-2.5 py-1 ${RECEIPT_LABEL[r.status].cls}`}>
                        {RECEIPT_LABEL[r.status].text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ReceiptUploadForm token={token} currency={invoice.currency} balance={balance} />
          </section>
        )}

        <DocumentPreview kind="invoice" document={invoice} client={invoice.clients} items={(items ?? []) as LineItem[]} settings={settings} paymentBlocks={blocks} />
      </div>
    </main>
  );
}
