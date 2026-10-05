"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { calculateTotals, formatMoney, round2 } from "@/lib/dashboard/format";
import { updateRetainer } from "@/lib/dashboard/actions/retainers";
import type { Retainer, RetainerItem } from "@/lib/dashboard/types";

type Line = {
  description: string;
  quantity: number;
  rate: number;
  item_type: "service" | "tool";
  included: boolean;
  catalog_item_id: string | null;
};

export default function RetainerForm({ retainer, items }: { retainer: Retainer; items: RetainerItem[] }) {
  const [lines, setLines] = useState<Line[]>(
    items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      rate: Number(i.rate),
      item_type: i.item_type,
      included: i.included !== false,
      catalog_item_id: i.catalog_item_id,
    }))
  );
  const [discountType, setDiscountType] = useState(retainer.discount_type);
  const [discountValue, setDiscountValue] = useState(Number(retainer.discount_value));
  const [taxEnabled, setTaxEnabled] = useState(retainer.tax_enabled);
  const [taxRate, setTaxRate] = useState(Number(retainer.tax_rate));
  const [toolsTaxEnabled, setToolsTaxEnabled] = useState(retainer.tools_tax_enabled);
  const [toolsTaxRate, setToolsTaxRate] = useState(Number(retainer.tools_tax_rate));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const totals = calculateTotals(
    lines.filter((l) => l.included),
    taxEnabled,
    taxRate,
    { enabled: discountValue > 0, type: discountType, value: discountValue },
    { enabled: toolsTaxEnabled, rate: toolsTaxRate }
  );

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const onSubmit = (formData: FormData) => {
    setError(null);
    setSaved(false);
    formData.set("items", JSON.stringify(lines));
    startTransition(async () => {
      const result = await updateRetainer(retainer.id, formData);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  };

  return (
    <form action={onSubmit} className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name">
            <input id="name" name="name" defaultValue={retainer.name} className={inputClasses} required />
          </Field>
          <Field label="Status" htmlFor="status" hint="Paused or ended retainers are skipped on the 1st.">
            <select id="status" name="status" defaultValue={retainer.status} className={inputClasses}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </Field>
          <Field label="Next invoice date" htmlFor="next_invoice_date" hint="Always the 1st of a month.">
            <input
              id="next_invoice_date"
              name="next_invoice_date"
              type="date"
              defaultValue={retainer.next_invoice_date ?? ""}
              className={inputClasses}
            />
          </Field>
          <Field label="Payment due (days after issue)" htmlFor="due_days">
            <input id="due_days" name="due_days" type="number" min={0} max={90} defaultValue={retainer.due_days} className={inputClasses} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-body-lg font-medium mb-1">Monthly lines</h2>
        <p className="text-small text-ink-muted mb-4">
          Untick a line (e.g. an optional tool) to keep it here but leave it off the invoices.
        </p>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div
              key={index}
              className={`grid gap-2 sm:grid-cols-[auto_1fr_90px_140px_110px_auto] items-center ${line.included ? "" : "opacity-55"}`}
            >
              <input
                type="checkbox"
                aria-label="Bill this line"
                title="Bill this line"
                checked={line.included}
                onChange={(e) => setLine(index, { included: e.target.checked })}
                className="size-4 accent-ink cursor-pointer"
              />
              <input
                aria-label="Description"
                value={line.description}
                onChange={(e) => setLine(index, { description: e.target.value })}
                className={inputClasses}
                placeholder="Service"
              />
              <input
                aria-label="Quantity"
                type="number"
                min={0}
                step="0.01"
                value={line.quantity}
                onChange={(e) => setLine(index, { quantity: Number(e.target.value) })}
                className={inputClasses}
              />
              <input
                aria-label="Rate"
                type="number"
                step="0.01"
                value={line.rate}
                onChange={(e) => setLine(index, { rate: Number(e.target.value) })}
                className={inputClasses}
              />
              <select
                aria-label="Type"
                value={line.item_type}
                onChange={(e) => setLine(index, { item_type: e.target.value as Line["item_type"] })}
                className={inputClasses}
              >
                <option value="service">Service</option>
                <option value="tool">Tool</option>
              </select>
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                className={buttonStyles.secondary}
                aria-label="Remove line"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, rate: 0, item_type: "service", included: true, catalog_item_id: null }])}
          className={`${buttonStyles.secondary} mt-4`}
        >
          <Plus className="size-4" aria-hidden /> Add line
        </button>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Discount type" htmlFor="discount_type">
            <select
              id="discount_type"
              name="discount_type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as Retainer["discount_type"])}
              className={inputClasses}
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </Field>
          <Field label="Discount" htmlFor="discount_value" hint="On services only, every month.">
            <input
              id="discount_value"
              name="discount_value"
              type="number"
              min={0}
              step="0.01"
              value={discountValue}
              onChange={(e) => setDiscountValue(Number(e.target.value))}
              className={inputClasses}
            />
          </Field>
          <div />
          <label className="flex items-center gap-2 text-small">
            <input type="checkbox" name="tax_enabled" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
            Charge tax
          </label>
          <Field label="Tax name" htmlFor="tax_name">
            <input id="tax_name" name="tax_name" defaultValue={retainer.tax_name} className={inputClasses} />
          </Field>
          <Field label="Tax rate (%)" htmlFor="tax_rate">
            <input
              id="tax_rate"
              name="tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              className={inputClasses}
            />
          </Field>
          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              name="tools_tax_enabled"
              checked={toolsTaxEnabled}
              onChange={(e) => setToolsTaxEnabled(e.target.checked)}
            />
            Tools: international transaction tax
          </label>
          <Field label="Tools tax rate (%)" htmlFor="tools_tax_rate">
            <input
              id="tools_tax_rate"
              name="tools_tax_rate"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={toolsTaxRate}
              onChange={(e) => setToolsTaxRate(Number(e.target.value))}
              className={inputClasses}
            />
          </Field>
        </div>
        <Field label="Notes (internal)" htmlFor="notes">
          <textarea id="notes" name="notes" rows={2} defaultValue={retainer.notes ?? ""} className={inputClasses} />
        </Field>

        <div className="border-t border-ink/10 pt-4 space-y-1 text-small max-w-sm ml-auto">
          <Row label="Services" value={formatMoney(totals.subtotal, retainer.currency)} />
          {totals.discountAmount > 0 && <Row label="Discount" value={`−${formatMoney(totals.discountAmount, retainer.currency)}`} />}
          {totals.taxAmount > 0 && <Row label={`Tax (${taxRate}%)`} value={formatMoney(totals.taxAmount, retainer.currency)} />}
          {totals.toolsTotal > 0 && <Row label="Tools (incl. est. tax)" value={formatMoney(totals.toolsTotal, retainer.currency)} />}
          <Row label="Each month" value={formatMoney(round2(totals.total), retainer.currency)} strong />
        </div>
      </Card>

      {error && <p className="text-small text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save retainer
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-small text-green-700">
            <CheckCircle2 className="size-4" aria-hidden /> Saved. Future invoices use these lines; issued ones don&apos;t change.
          </span>
        )}
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-6 ${strong ? "font-semibold border-t border-ink/10 pt-2 mt-1" : "text-ink-muted"}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

/** "Create invoice for a month" — for a month the 1st-of-month run hasn't
 *  reached yet, or to re-open a missed one. Same month twice = same invoice. */
export function RetainerInvoiceNow({
  defaultPeriod,
  action,
}: {
  defaultPeriod: string;
  action: (period: string) => Promise<{ error?: string } | undefined>;
}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Month" htmlFor="retainer_period">
        <input
          id="retainer_period"
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={inputClasses}
        />
      </Field>
      <button
        type="button"
        disabled={pending || !period}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action(period);
            if (result?.error) setError(result.error);
          });
        }}
        className={buttonStyles.secondary}
      >
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Create draft invoice
      </button>
      {error && <p className="w-full text-small text-red-700">{error}</p>}
    </div>
  );
}
