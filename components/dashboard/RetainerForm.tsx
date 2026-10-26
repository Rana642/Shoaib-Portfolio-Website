"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { calculateTotals, formatMoney, round2 } from "@/lib/dashboard/format";
import { updateRetainer } from "@/lib/dashboard/actions/retainers";
import type { Retainer, RetainerAddon, RetainerItem } from "@/lib/dashboard/types";

type Line = {
  description: string;
  quantity: number;
  rate: number;
  item_type: "service" | "tool";
  included: boolean;
  is_complimentary: boolean;
  catalog_item_id: string | null;
};

type Addon = {
  id: string | null;
  description: string;
  quantity: number;
  rate: number;
  recurring: boolean;
  apply_discount: boolean;
  apply_tax: boolean;
  billed_invoice_id: string | null;
};

export default function RetainerForm({
  retainer,
  items,
  addons = [],
  addonSuggestions = [],
  billedOn = {},
}: {
  retainer: Retainer;
  items: RetainerItem[];
  addons?: RetainerAddon[];
  /** Add-on names used before, offered as you type. */
  addonSuggestions?: string[];
  /** invoice id → number, for one-off add-ons already billed. */
  billedOn?: Record<string, string>;
}) {
  const [lines, setLines] = useState<Line[]>(
    items.map((i) => ({
      description: i.description,
      quantity: Number(i.quantity),
      rate: Number(i.rate),
      item_type: i.item_type,
      included: i.included !== false,
      is_complimentary: Boolean(i.is_complimentary),
      catalog_item_id: i.catalog_item_id,
    }))
  );
  const [addonLines, setAddonLines] = useState<Addon[]>(
    addons.map((a) => ({
      id: a.id,
      description: a.description,
      quantity: Number(a.quantity),
      rate: Number(a.rate),
      recurring: a.recurring,
      apply_discount: a.apply_discount,
      apply_tax: a.apply_tax,
      billed_invoice_id: a.billed_invoice_id,
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

  // "Each month" = the billed lines plus the add-ons that recur every month.
  const totals = calculateTotals(
    [
      ...lines.filter((l) => l.included),
      ...addonLines
        .filter((a) => a.recurring)
        .map((a) => ({ quantity: a.quantity, rate: a.rate, item_type: "addon" as const, addon_discount: a.apply_discount, addon_tax: a.apply_tax })),
    ],
    taxEnabled,
    taxRate,
    { enabled: discountValue > 0, type: discountType, value: discountValue },
    { enabled: toolsTaxEnabled, rate: toolsTaxRate }
  );
  const nextOnly = addonLines.filter((a) => !a.recurring && !a.billed_invoice_id);

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const setAddon = (index: number, patch: Partial<Addon>) =>
    setAddonLines((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));

  const onSubmit = (formData: FormData) => {
    setError(null);
    setSaved(false);
    formData.set("items", JSON.stringify(lines));
    formData.set("addons", JSON.stringify(addonLines));
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
          Untick a line (e.g. an optional tool) to keep it here but leave it off the invoices. A complimentary line is shown on
          every invoice with its value, but never charged.
        </p>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className={line.included ? "" : "opacity-55"}>
            <div className="grid gap-2 sm:grid-cols-[auto_1fr_90px_140px_110px_auto] items-center">
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
            <label className="mt-1 ml-6 inline-flex items-center gap-2 text-tag text-ink-muted cursor-pointer">
              <input
                type="checkbox"
                checked={line.is_complimentary}
                onChange={(e) => setLine(index, { is_complimentary: e.target.checked })}
                className="size-3.5 accent-ink"
              />
              Complimentary: show its value on the invoice, don&apos;t charge it
            </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setLines((prev) => [
              ...prev,
              { description: "", quantity: 1, rate: 0, item_type: "service", included: true, is_complimentary: false, catalog_item_id: null },
            ])
          }
          className={`${buttonStyles.secondary} mt-4`}
        >
          <Plus className="size-4" aria-hidden /> Add line
        </button>
      </Card>

      <Card className="p-6">
        <h2 className="text-body-lg font-medium mb-1">Add-ons</h2>
        <p className="text-small text-ink-muted mb-4">
          Extras billed on the same invoice: a domain renewal, a Claude subscription… Listed apart on the invoice, and kept out
          of your income in Finance (client money). Choose for each one whether the discount and GST apply.
        </p>
        <datalist id="addon-suggestions">
          {addonSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {addonLines.length === 0 && <p className="text-small text-ink-subtle mb-2">No add-ons yet.</p>}
        <div className="space-y-4">
          {addonLines.map((addon, index) => {
            const billed = !addon.recurring && addon.billed_invoice_id;
            return (
              <div key={index} className={`rounded-lg border border-ink/10 p-3 space-y-2 ${billed ? "opacity-60" : ""}`}>
                <div className="grid gap-2 sm:grid-cols-[1fr_90px_140px_auto] items-center">
                  <input
                    aria-label="Add-on"
                    list="addon-suggestions"
                    value={addon.description}
                    onChange={(e) => setAddon(index, { description: e.target.value })}
                    className={inputClasses}
                    placeholder="e.g. Domain renewal — example.com (1 year)"
                  />
                  <input
                    aria-label="Quantity"
                    type="number"
                    min={0}
                    step="0.01"
                    value={addon.quantity}
                    onChange={(e) => setAddon(index, { quantity: Number(e.target.value) })}
                    className={inputClasses}
                  />
                  <input
                    aria-label="Rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={addon.rate}
                    onChange={(e) => setAddon(index, { rate: Number(e.target.value) })}
                    className={inputClasses}
                  />
                  <button
                    type="button"
                    onClick={() => setAddonLines((prev) => prev.filter((_, i) => i !== index))}
                    className={buttonStyles.secondary}
                    aria-label="Remove add-on"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-tag text-ink-muted">
                  <select
                    aria-label="When to bill"
                    value={addon.recurring ? "monthly" : "once"}
                    onChange={(e) => setAddon(index, { recurring: e.target.value === "monthly", billed_invoice_id: null })}
                    className="rounded-md border border-ink/15 bg-white px-2 py-1 text-tag"
                  >
                    <option value="once">Next invoice only</option>
                    <option value="monthly">Every month</option>
                  </select>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addon.apply_discount}
                      onChange={(e) => setAddon(index, { apply_discount: e.target.checked })}
                      className="size-3.5 accent-ink"
                    />
                    Discount applies
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addon.apply_tax}
                      onChange={(e) => setAddon(index, { apply_tax: e.target.checked })}
                      className="size-3.5 accent-ink"
                    />
                    GST applies
                  </label>
                  {billed && (
                    <span className="text-green-700">
                      Billed on {billedOn[addon.billed_invoice_id!] ?? "an invoice"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() =>
            setAddonLines((prev) => [
              ...prev,
              { id: null, description: "", quantity: 1, rate: 0, recurring: false, apply_discount: false, apply_tax: false, billed_invoice_id: null },
            ])
          }
          className={`${buttonStyles.secondary} mt-4`}
        >
          <Plus className="size-4" aria-hidden /> Add add-on
        </button>
        <p className="text-tag text-ink-subtle mt-3">
          To add something to an invoice that&apos;s already made, open the draft invoice and use “Add add-on”.
        </p>
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
          <Field label="Discount" htmlFor="discount_value" hint="On services (and add-ons that opt in), every month.">
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
          {totals.toolsTotal > 0 && <Row label="Tools (incl. est. tax)" value={formatMoney(totals.toolsTotal, retainer.currency)} />}
          {totals.addonsSubtotal > 0 && <Row label="Monthly add-ons" value={formatMoney(totals.addonsSubtotal, retainer.currency)} />}
          {totals.discountAmount > 0 && <Row label="Discount" value={`−${formatMoney(totals.discountAmount, retainer.currency)}`} />}
          {totals.taxAmount > 0 && <Row label={`Tax (${taxRate}%)`} value={formatMoney(totals.taxAmount, retainer.currency)} />}
          <Row label="Each month" value={formatMoney(round2(totals.total), retainer.currency)} strong />
          {nextOnly.length > 0 && (
            <p className="text-tag text-ink-subtle pt-1">
              Next invoice also carries {nextOnly.length} one-off add-on{nextOnly.length === 1 ? "" : "s"} (
              {formatMoney(
                round2(nextOnly.reduce((sum, a) => sum + a.quantity * a.rate, 0)),
                retainer.currency
              )}{" "}
              before discount/GST).
            </p>
          )}
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
