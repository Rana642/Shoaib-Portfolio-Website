"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CalendarClock, LoaderCircle, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { deleteBill, saveBill, setBillActive } from "@/lib/dashboard/actions/finance";
import { Card, Field, StatusBadge, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { formatDate, formatMoney } from "@/lib/dashboard/format";
import {
  BILL_FREQUENCIES,
  EXPENSE_GROUPS,
  FINANCE_CURRENCIES,
  PAYMENT_METHODS,
  categoryLabel,
  todayPk,
  type BillFrequency,
} from "@/lib/finance";
import type { FinanceBill } from "@/lib/dashboard/finance";
import EntryForm from "./EntryForm";

const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);

function dueBadge(bill: FinanceBill, today: string) {
  if (!bill.is_active) return <StatusBadge status="paused" />;
  const d = daysUntil(bill.next_due, today);
  if (d < 0) return <StatusBadge status="overdue" label={`${-d} day${d === -1 ? "" : "s"} late`} />;
  if (d === 0) return <StatusBadge status="pending" label="Due today" />;
  if (d <= 7) return <StatusBadge status="pending" label={`In ${d} day${d === 1 ? "" : "s"}`} />;
  return <StatusBadge status="draft" label={formatDate(bill.next_due)} />;
}

/**
 * Bills that come back every month / quarter / year (Vercel, Hostinger,
 * internet…). "Mark paid" records the expense — with what was actually
 * charged — and moves the bill to its next due date.
 */
export default function BillsPanel({
  bills,
  clients,
  rates,
  compact = false,
  startAdding = false,
}: {
  bills: FinanceBill[];
  clients: { id: string; name: string }[];
  rates: Record<string, number>;
  /** Overview: only active bills due in the next 30 days, no add/edit. */
  compact?: boolean;
  /** Opened from "+ New → Add a monthly bill". */
  startAdding?: boolean;
}) {
  const router = useRouter();
  const today = todayPk();
  const [paying, setPaying] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(startAdding ? "new" : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const shown = compact ? bills.filter((b) => b.is_active && daysUntil(b.next_due, today) <= 30) : bills;

  const run = (id: string, fn: () => Promise<{ ok: true } | { error: string }>) => {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Card className="p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-body-lg font-semibold flex items-center gap-2">
            <CalendarClock className="size-5 text-ink-muted" aria-hidden />
            {compact ? "Bills due soon" : "Monthly bills"}
          </h2>
          <p className="text-small text-ink-muted mt-1">
            {compact
              ? "Active bills due in the next 30 days."
              : "Bills that come back every month, quarter or year. Mark one paid to add the expense and move it to its next date."}
          </p>
        </div>
        {!compact && editing !== "new" && (
          <button type="button" onClick={() => setEditing("new")} className={buttonStyles.secondary}>
            <Plus className="size-4" aria-hidden />
            Add a bill
          </button>
        )}
      </div>

      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mb-4">{error}</p>}

      {editing === "new" && (
        <div className="mb-6 rounded-xl border border-ink/10 bg-white/60 p-5">
          <BillForm
            clients={clients}
            onDone={(saved) => {
              setEditing(null);
              if (saved) router.refresh();
            }}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-small text-ink-muted">
          {compact ? "Nothing due in the next 30 days." : "No bills yet — add the ones you pay every month (hosting, software, internet)."}
        </p>
      ) : (
        <ul className="divide-y divide-ink/5">
          {shown.map((b) => (
            <li key={b.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-small font-medium ${b.is_active ? "" : "text-ink-muted"}`}>
                    {b.name}
                    {b.vendor && <span className="font-normal text-ink-muted"> · {b.vendor}</span>}
                  </p>
                  <p className="text-tag text-ink-subtle mt-1">
                    {categoryLabel("expense", b.category)} · {BILL_FREQUENCIES.find((f) => f.key === b.frequency)?.label}
                    {b.clients?.name && ` · ${b.clients.name}`}
                  </p>
                </div>
                <p className="text-small font-medium whitespace-nowrap">{formatMoney(Number(b.amount), b.currency)}</p>
                <div className="min-w-32 whitespace-nowrap">{dueBadge(b, today)}</div>
                <div className="flex items-center gap-3">
                  {b.is_active && (
                    <button type="button" onClick={() => setPaying(paying === b.id ? null : b.id)} className={`${buttonStyles.secondary} py-1.5`}>
                      Mark paid
                    </button>
                  )}
                  {!compact && (
                    <div className="flex items-center gap-3 text-ink-muted">
                      <button type="button" onClick={() => setEditing(editing === b.id ? null : b.id)} aria-label="Edit bill" title="Edit" className="hover:text-ink cursor-pointer">
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(b.id, () => setBillActive(b.id, !b.is_active))}
                        aria-label={b.is_active ? "Pause bill" : "Resume bill"}
                        title={b.is_active ? "Pause" : "Resume"}
                        className="hover:text-ink cursor-pointer"
                      >
                        {b.is_active ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                      </button>
                      <button
                        type="button"
                        onClick={() => confirm(`Delete the bill “${b.name}”? Expenses already recorded stay.`) && run(b.id, () => deleteBill(b.id))}
                        aria-label="Delete bill"
                        title="Delete"
                        className="hover:text-red-700 cursor-pointer"
                      >
                        {busy === b.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {editing === b.id && (
                <div className="mt-4 rounded-xl border border-ink/10 bg-white/60 p-5">
                  <BillForm
                    bill={b}
                    clients={clients}
                    onDone={(saved) => {
                      setEditing(null);
                      if (saved) router.refresh();
                    }}
                  />
                </div>
              )}
              {paying === b.id && (
                <div className="mt-4 rounded-xl border border-ink/10 bg-white/60 p-5">
                  <p className="text-small text-ink-muted mb-4">
                    Enter what was actually charged — the bill then moves to its next date.
                  </p>
                  <EntryForm
                    kind="expense"
                    clients={clients}
                    rates={rates}
                    submitLabel="Save as paid"
                    initial={{
                      entry_date: today,
                      category: b.category,
                      party: b.vendor ?? b.name,
                      description: b.name,
                      amount: Number(b.amount) || undefined,
                      currency: b.currency,
                      client_id: b.client_id,
                      method: b.method,
                      bill_id: b.id,
                    }}
                    onDone={() => {
                      setPaying(null);
                      router.refresh();
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function BillForm({
  bill,
  clients,
  onDone,
}: {
  bill?: FinanceBill;
  clients: { id: string; name: string }[];
  onDone: (saved: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = bill?.id ?? "new";

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await saveBill({
        id: bill?.id ?? null,
        name: String(formData.get("name") ?? ""),
        vendor: String(formData.get("vendor") ?? ""),
        category: String(formData.get("category") ?? ""),
        amount: Number(formData.get("amount") || 0),
        currency: String(formData.get("currency")) as (typeof FINANCE_CURRENCIES)[number],
        frequency: String(formData.get("frequency")) as BillFrequency,
        next_due: String(formData.get("next_due") ?? ""),
        client_id: String(formData.get("client_id") ?? "") || null,
        method: String(formData.get("method") ?? ""),
        is_active: bill?.is_active ?? true,
        notes: bill?.notes ?? null,
      });
      if ("error" in res) setError(res.error ?? "Couldn't save.");
      else onDone(true);
    });
  };

  return (
    <form action={submit} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Field label="Bill name" htmlFor={`bill-${key}-name`}>
          <input id={`bill-${key}-name`} name="name" required defaultValue={bill?.name} placeholder="Vercel Pro" className={inputClasses} />
        </Field>
        <Field label="Paid to (optional)" htmlFor={`bill-${key}-vendor`}>
          <input id={`bill-${key}-vendor`} name="vendor" defaultValue={bill?.vendor ?? ""} placeholder="Vercel" className={inputClasses} />
        </Field>
        <Field label="Category" htmlFor={`bill-${key}-category`}>
          <select id={`bill-${key}-category`} name="category" required defaultValue={bill?.category ?? ""} className={inputClasses}>
            <option value="">Choose…</option>
            {EXPENSE_GROUPS.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Usual amount" htmlFor={`bill-${key}-amount`} hint="Usage bills vary — you enter the real amount when you pay.">
          <div className="flex gap-2">
            <input
              id={`bill-${key}-amount`}
              name="amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={bill ? Number(bill.amount) : ""}
              className={cn(inputClasses, "min-w-0 flex-1")}
            />
            <select name="currency" aria-label="Currency" defaultValue={bill?.currency ?? "USD"} className={cn(inputClasses, "w-24 shrink-0 px-2.5")}>
              {FINANCE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <Field label="Repeats" htmlFor={`bill-${key}-frequency`}>
          <select id={`bill-${key}-frequency`} name="frequency" defaultValue={bill?.frequency ?? "monthly"} className={inputClasses}>
            {BILL_FREQUENCIES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next due" htmlFor={`bill-${key}-due`}>
          <input id={`bill-${key}-due`} name="next_due" type="date" required defaultValue={bill?.next_due ?? todayPk()} className={inputClasses} />
        </Field>
        <Field label="Client (optional)" htmlFor={`bill-${key}-client`} hint="For a tool you pay for one client.">
          <select id={`bill-${key}-client`} name="client_id" defaultValue={bill?.client_id ?? ""} className={inputClasses}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid by (optional)" htmlFor={`bill-${key}-method`}>
          <input id={`bill-${key}-method`} name="method" list={`bill-${key}-methods`} defaultValue={bill?.method ?? ""} placeholder="Card" className={inputClasses} />
          <datalist id={`bill-${key}-methods`}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>
      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {bill ? "Save bill" : "Add bill"}
        </button>
        <button type="button" onClick={() => onDone(false)} className={buttonStyles.secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
