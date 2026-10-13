"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveEntry } from "@/lib/dashboard/actions/finance";
import { Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import {
  EXPENSE_GROUPS,
  FINANCE_CURRENCIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  RECEIPT_MAX_BYTES,
  RECEIPT_TYPES,
  formatPkr,
  isPassThroughCategory,
  todayPk,
  type EntryKind,
} from "@/lib/finance";

export type EntryInitial = {
  id?: string;
  entry_date?: string;
  category?: string;
  party?: string | null;
  description?: string | null;
  amount?: number;
  currency?: string;
  pkr_amount?: number | null;
  client_id?: string | null;
  pass_through?: boolean;
  method?: string | null;
  notes?: string | null;
  bill_id?: string | null;
  fileName?: string | null;
};

/**
 * Add or edit one line of money out (expense) or in (other income). Amounts in
 * another currency show their PKR value at today's rate; leave it and it's
 * saved at the rate on the entry's date, or type what the bank actually took.
 */
export default function EntryForm({
  kind,
  clients,
  rates,
  initial,
  onDone,
  submitLabel,
}: {
  kind: EntryKind;
  clients: { id: string; name: string }[];
  /** PKR for 1 unit of each currency, today. */
  rates: Record<string, number>;
  initial?: EntryInitial;
  onDone: () => void;
  submitLabel?: string;
}) {
  const [date, setDate] = useState(initial?.entry_date ?? todayPk());
  const [category, setCategory] = useState(initial?.category ?? "");
  const [party, setParty] = useState(initial?.party ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "PKR");
  // An existing entry keeps its saved PKR; a new one follows the rate until typed over.
  const [pkr, setPkr] = useState(initial?.pkr_amount != null && initial.currency !== "PKR" ? String(initial.pkr_amount) : "");
  const [pkrManual, setPkrManual] = useState(Boolean(initial?.id && initial.currency !== "PKR"));
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [passThrough, setPassThrough] = useState(Boolean(initial?.pass_through));
  const [method, setMethod] = useState(initial?.method ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [file, setFile] = useState<{ key: string; name: string } | null>(null);
  const [keptFileName, setKeptFileName] = useState(initial?.fileName ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const forcedPassThrough = category ? isPassThroughCategory(kind, category) : false;
  const amountNum = Number(amount);
  const rate = rates[currency];
  const autoPkr = currency !== "PKR" && rate && amountNum > 0 ? Math.round(amountNum * rate * 100) / 100 : null;
  const id = (name: string) => `${kind}-${initial?.id ?? "new"}-${name}`;

  const attach = async (f: File) => {
    setError(null);
    if (!RECEIPT_TYPES.includes(f.type)) return setError("Attach a photo (JPG, PNG, WebP, HEIC) or a PDF.");
    if (f.size > RECEIPT_MAX_BYTES) return setError("The file must be under 10 MB.");
    setUploading(true);
    try {
      const res = await fetch("/api/dashboard/finance/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, type: f.type, size: f.size }),
      });
      const json = (await res.json()) as { url?: string; key?: string; error?: string };
      if (!res.ok || !json.url || !json.key) throw new Error(json.error ?? "Couldn't upload the file.");
      const put = await fetch(json.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
      if (!put.ok) throw new Error("Couldn't upload the file. Please try again.");
      setFile({ key: json.key, name: f.name });
      setKeptFileName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload the file.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveEntry({
        id: initial?.id ?? null,
        kind,
        entry_date: date,
        category,
        party,
        description,
        amount: amountNum,
        currency: currency as (typeof FINANCE_CURRENCIES)[number],
        pkr_amount: currency !== "PKR" && pkrManual && Number(pkr) > 0 ? Number(pkr) : null,
        client_id: clientId || null,
        pass_through: forcedPassThrough || passThrough,
        method,
        notes,
        bill_id: initial?.bill_id ?? null,
        file,
        remove_file: Boolean(initial?.fileName) && !file && !keptFileName,
      });
      if ("error" in res) setError(res.error ?? "Couldn't save.");
      else onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Field label="Date" htmlFor={id("date")}>
          <input id={id("date")} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} />
        </Field>
        <Field label="Category" htmlFor={id("category")}>
          <select id={id("category")} required value={category} onChange={(e) => setCategory(e.target.value)} className={inputClasses}>
            <option value="">Choose…</option>
            {kind === "expense"
              ? EXPENSE_GROUPS.map((g) => (
                  <optgroup key={g.key} label={g.label}>
                    {g.categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))
              : INCOME_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
          </select>
        </Field>
        <Field label={kind === "expense" ? "Paid to" : "Received from"} htmlFor={id("party")}>
          <input
            id={id("party")}
            value={party}
            onChange={(e) => setParty(e.target.value)}
            placeholder={kind === "expense" ? "Vercel, a freelancer…" : "Hostinger, a client…"}
            className={inputClasses}
          />
        </Field>
        <Field label="Client (optional)" htmlFor={id("client")} hint="Tag it to see profit per client.">
          <select id={id("client")} value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClasses}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Field label="Amount" htmlFor={id("amount")}>
          <div className="flex gap-2">
            <input
              id={id("amount")}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(inputClasses, "min-w-0 flex-1")}
            />
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={cn(inputClasses, "w-24 shrink-0 px-2.5")}
            >
              {FINANCE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </Field>
        {currency !== "PKR" && (
          <Field
            label="In PKR"
            htmlFor={id("pkr")}
            hint={
              pkrManual
                ? "What your bank actually took or paid."
                : rate
                  ? `At today's rate (1 ${currency} = ${rate.toFixed(2)}); saved at the rate on the date. Type to change.`
                  : `No ${currency} rate today — type the PKR amount.`
            }
          >
            <input
              id={id("pkr")}
              type="number"
              step="0.01"
              min="0"
              value={pkrManual ? pkr : autoPkr ?? ""}
              placeholder={autoPkr ? formatPkr(autoPkr) : ""}
              onChange={(e) => {
                setPkr(e.target.value);
                setPkrManual(e.target.value !== "");
              }}
              className={inputClasses}
            />
          </Field>
        )}
        <Field label="Paid by" htmlFor={id("method")}>
          <input
            id={id("method")}
            list={id("methods")}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="Bank transfer"
            className={inputClasses}
          />
          <datalist id={id("methods")}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="What for (optional)" htmlFor={id("description")}>
          <input id={id("description")} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClasses} />
        </Field>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Field label="Notes (optional)" htmlFor={id("notes")}>
          <textarea id={id("notes")} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClasses} />
        </Field>
        <div className="space-y-3">
          <p className="block text-small font-medium">Receipt or bill (optional)</p>
          <div className="flex flex-wrap items-center gap-3">
            {file || keptFileName ? (
              <span className="inline-flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-3 py-2 text-small">
                <Paperclip className="size-4 text-ink-muted" aria-hidden />
                <span className="max-w-[16rem] truncate">{file?.name ?? keptFileName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setKeptFileName(null);
                  }}
                  aria-label="Remove the file"
                  className="text-ink-muted hover:text-ink cursor-pointer"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={buttonStyles.secondary}>
                {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
                {uploading ? "Uploading…" : "Attach photo or PDF"}
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={RECEIPT_TYPES.join(",")}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])}
            />
          </div>
          <label className="flex items-start gap-3 text-small cursor-pointer">
            <input
              type="checkbox"
              checked={forcedPassThrough || passThrough}
              disabled={forcedPassThrough}
              onChange={(e) => setPassThrough(e.target.checked)}
              className="mt-0.5 size-4 accent-ink"
            />
            <span>
              A client&apos;s own money (like their ad budget) —{" "}
              {kind === "expense" ? "not your cost" : "not your income"}. Kept out of profit.
            </span>
          </label>
        </div>
      </div>

      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || uploading} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {submitLabel ?? (initial?.id ? "Save changes" : kind === "expense" ? "Add expense" : "Add income")}
        </button>
        <button type="button" onClick={onDone} className={buttonStyles.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
