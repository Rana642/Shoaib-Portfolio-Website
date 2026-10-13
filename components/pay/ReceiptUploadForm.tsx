"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, Paperclip } from "lucide-react";
import { PAY_CURRENCIES, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/payment-accounts";

const input =
  "w-full rounded-lg bg-white border border-ink/15 px-3.5 py-2.5 text-body focus:outline-none focus:border-citrus focus:ring-2 focus:ring-citrus/25 transition-all";
const label = "block text-small font-medium mb-1.5";

/**
 * "Upload payment receipt": the client picks the screenshot/PDF of their
 * transfer, it goes straight to private storage, then the details are sent
 * for Shoaib to confirm by hand. On an invoice (token) the payer and currency
 * come from the invoice; on /pay the payer fills them in.
 */
export default function ReceiptUploadForm({
  token,
  currency,
  balance,
}: {
  token?: string;
  currency?: string;
  balance?: number;
}) {
  const onInvoice = Boolean(token);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!RECEIPT_TYPES.includes(f.type)) return setError("Please choose a photo (JPG, PNG, WebP, HEIC) or a PDF.");
    if (f.size > RECEIPT_MAX_BYTES) return setError("The receipt must be under 10 MB.");
    setFile(f);
  };

  const submit = async (form: HTMLFormElement) => {
    setError(null);
    if (!file) return setError("Attach the receipt (screenshot or PDF of your transfer).");
    const fd = new FormData(form);
    setBusy(true);
    try {
      const up = await fetch("/api/pay/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: file.name, type: file.type, size: file.size }),
      });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error || "Upload failed. Please try again.");
      const put = await fetch(upData.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Couldn't upload the file. Please try again.");
      const res = await fetch("/api/pay/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          key: upData.key,
          name: file.name,
          amount: fd.get("amount"),
          currency: fd.get("currency") ?? currency ?? "",
          paid_on: fd.get("paid_on"),
          reference: fd.get("reference") ?? "",
          note: fd.get("note") ?? "",
          payer_name: fd.get("payer_name") ?? "",
          payer_email: fd.get("payer_email") ?? "",
          payer_phone: fd.get("payer_phone") ?? "",
          invoice_number: fd.get("invoice_number") ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't send the receipt. Please try again.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border border-green-600/25 bg-green-500/5 p-6">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="size-5 text-green-700" aria-hidden />
          <h2 className="text-body-lg font-semibold">Receipt received</h2>
        </div>
        <p className="text-small text-ink-muted mt-2">
          Thank you. I&apos;ll check it against my bank account and confirm by email, usually within one working day.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="rounded-xl border border-ink/10 bg-white p-6 space-y-4"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <FileUp className="size-5 text-cobalt" aria-hidden />
          <h2 className="text-body-lg font-semibold">Upload payment receipt</h2>
        </div>
        <p className="text-small text-ink-muted mt-1.5">Paid already? Send the screenshot or PDF of your transfer and I&apos;ll confirm it.</p>
      </div>

      {!onInvoice && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="payer_name" className={label}>Your name</label>
            <input id="payer_name" name="payer_name" required maxLength={120} className={input} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="payer_email" className={label}>Email</label>
            <input id="payer_email" name="payer_email" type="email" required maxLength={200} className={input} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="payer_phone" className={label}>Phone / WhatsApp <span className="text-ink-subtle font-normal">(optional)</span></label>
            <input id="payer_phone" name="payer_phone" maxLength={40} className={input} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="invoice_number" className={label}>Invoice number <span className="text-ink-subtle font-normal">(if any)</span></label>
            <input id="invoice_number" name="invoice_number" maxLength={40} placeholder="INV-2026-001" className={input} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className={label}>Amount sent{onInvoice && currency ? ` (${currency})` : ""}</label>
          <div className="flex gap-2">
            {!onInvoice && (
              <select name="currency" defaultValue="PKR" className={`${input} w-28 shrink-0`} aria-label="Currency">
                {PAY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={balance && balance > 0 ? balance : undefined}
              className={input}
            />
          </div>
        </div>
        <div>
          <label htmlFor="paid_on" className={label}>Payment date</label>
          <input id="paid_on" name="paid_on" type="date" required defaultValue={today} max={today} className={input} />
        </div>
      </div>

      <div>
        <label htmlFor="reference" className={label}>Transaction / reference number <span className="text-ink-subtle font-normal">(optional)</span></label>
        <input id="reference" name="reference" maxLength={120} className={input} />
      </div>

      <div>
        <span className={label}>Receipt</span>
        <input
          ref={fileRef}
          type="file"
          accept={RECEIPT_TYPES.join(",")}
          onChange={(e) => pick(e.target.files?.[0])}
          className="sr-only"
          id="receipt-file"
        />
        <label
          htmlFor="receipt-file"
          className="flex items-center gap-3 rounded-lg border border-dashed border-ink/25 px-4 py-4 cursor-pointer hover:border-citrus hover:bg-citrus/5 transition-colors"
        >
          <Paperclip className="size-4 text-ink-muted shrink-0" aria-hidden />
          <span className="text-small min-w-0 truncate">
            {file ? file.name : "Choose a screenshot or PDF (max 10 MB)"}
          </span>
        </label>
      </div>

      <div>
        <label htmlFor="note" className={label}>Note <span className="text-ink-subtle font-normal">(optional)</span></label>
        <textarea id="note" name="note" rows={2} maxLength={1000} className={input} />
      </div>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium bg-ink text-cloud hover:bg-ink/90 transition-all disabled:opacity-60 w-full sm:w-auto"
      >
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {busy ? "Sending…" : "Send receipt"}
      </button>
    </form>
  );
}
