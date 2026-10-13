"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, LoaderCircle, X } from "lucide-react";
import { confirmReceipt, rejectReceipt } from "@/lib/dashboard/actions/receipts";
import { StatusBadge, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { formatMoney, formatDate } from "@/lib/dashboard/format";
import type { OpenInvoice, ReceiptWithLink } from "@/lib/dashboard/receipts";

/** One uploaded payment receipt: details, a link to the file, and (while
 *  pending) Confirm → payment on an invoice, or Reject with a reason. */
export default function ReceiptReview({ receipt, invoices }: { receipt: ReceiptWithLink; invoices: OpenInvoice[] }) {
  const r = receipt;
  // the receipt's own invoice, or one matching the number typed on /pay
  const guess =
    r.invoice_id ??
    invoices.find((i) => r.invoice_number && i.number.toLowerCase() === r.invoice_number.toLowerCase())?.id ??
    "";
  const [invoiceId, setInvoiceId] = useState(guess);
  const [amount, setAmount] = useState(String(r.amount));
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const choices = invoices.filter((i) => i.currency === r.currency || i.id === r.invoice_id);

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-lg font-semibold">{formatMoney(Number(r.amount), r.currency)}</p>
          <p className="text-small text-ink-muted">
            {r.payer_name || r.clientName || "Unknown payer"}
            {r.payer_email ? ` · ${r.payer_email}` : ""}
            {r.payer_phone ? ` · ${r.payer_phone}` : ""}
          </p>
          <p className="text-tag text-ink-subtle mt-1">
            Paid {formatDate(r.paid_on)} · sent {formatDate(r.created_at)}
            {r.reference ? ` · Ref ${r.reference}` : ""}
            {r.source === "pay_page" ? " · via /pay" : ""}
          </p>
          {r.invoice_number && (
            <p className="text-tag text-ink-subtle">
              Invoice:{" "}
              {r.invoice_id ? (
                <Link href={`/dashboard/invoices/${r.invoice_id}`} className="underline underline-offset-4">{r.invoice_number}</Link>
              ) : (
                <span>{r.invoice_number} (typed by payer)</span>
              )}
            </p>
          )}
          {r.note && <p className="text-small text-ink-muted mt-2 whitespace-pre-line">“{r.note}”</p>}
          {r.status === "rejected" && r.reject_reason && <p className="text-small text-red-700 mt-2">Rejected: {r.reject_reason}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={r.status} />
          {r.viewUrl && (
            <a href={r.viewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-small underline underline-offset-4">
              View receipt <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>

      {r.status === "pending" && (
        <div className="mt-4 pt-4 border-t border-ink/10 space-y-3">
          {mode === "idle" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
                <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className={inputClasses} aria-label="Apply to invoice">
                  <option value="">Don&apos;t apply to an invoice</option>
                  {choices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number} · {i.clientName ?? "—"} · due {formatMoney(i.balance, i.currency)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClasses}
                  aria-label={`Amount received (${r.currency})`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => confirmReceipt(r.id, { invoiceId: invoiceId || null, amount: Number(amount) }))}
                  className={buttonStyles.primary}
                >
                  {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                  Confirm payment
                </button>
                <button type="button" disabled={pending} onClick={() => setMode("reject")} className={buttonStyles.danger}>
                  <X className="size-4" aria-hidden />
                  Reject
                </button>
              </div>
              <p className="text-tag text-ink-subtle">Check the money is in your bank account first. Confirm records it on the invoice and emails the client.</p>
            </>
          ) : (
            <>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. I couldn't find this transfer in my account. Please check the account number and send the bank's receipt."
                className={inputClasses}
                aria-label="Reason for the client"
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => rejectReceipt(r.id, reason))} className={buttonStyles.danger}>
                  {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                  Reject and email the client
                </button>
                <button type="button" disabled={pending} onClick={() => setMode("idle")} className={buttonStyles.secondary}>
                  Cancel
                </button>
              </div>
            </>
          )}
          {error && <p className="text-small text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
