"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createDocument, updateDocument } from "@/lib/dashboard/actions/documents";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { formatMoney, calculateTotals } from "@/lib/dashboard/format";
import { CURRENCIES, type CatalogItem, type Client, type Settings } from "@/lib/dashboard/types";

type EditableItem = {
  key: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
};

type ExistingDocument = {
  id: string;
  client_id: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  items: { catalog_item_id: string | null; description: string; quantity: number; rate: number }[];
};

let keyCounter = 0;
const nextKey = () => `item-${keyCounter++}`;

export default function DocumentForm({
  kind,
  clients,
  catalog,
  settings,
  document,
}: {
  kind: "quotation" | "invoice";
  clients: Client[];
  catalog: CatalogItem[];
  settings: Settings;
  document?: ExistingDocument;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [clientId, setClientId] = useState(document?.client_id ?? "");
  const [currency, setCurrency] = useState(document?.currency ?? settings.default_currency);
  const [taxEnabled, setTaxEnabled] = useState(document?.tax_enabled ?? settings.tax_enabled);
  const [taxRate, setTaxRate] = useState(document?.tax_rate ?? settings.tax_rate);
  const [items, setItems] = useState<EditableItem[]>(
    document?.items.map((item) => ({ ...item, key: nextKey() })) ?? [
      { key: nextKey(), catalog_item_id: null, description: "", quantity: 1, rate: 0 },
    ]
  );

  const totals = useMemo(
    () => calculateTotals(items, taxEnabled, taxRate),
    [items, taxEnabled, taxRate]
  );

  const updateItem = (key: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { key: nextKey(), catalog_item_id: null, description: "", quantity: 1, rate: 0 },
    ]);

  const removeItem = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((item) => item.key !== key)));

  /** Picking a catalog item fills description and rate, but both stay
   *  editable — the document keeps its own copy, so later catalog edits
   *  never rewrite an already-sent document. */
  const applyCatalogItem = (key: string, catalogId: string) => {
    if (!catalogId) {
      updateItem(key, { catalog_item_id: null });
      return;
    }
    const source = catalog.find((c) => c.id === catalogId);
    if (!source) return;
    updateItem(key, {
      catalog_item_id: source.id,
      description: source.description
        ? `${source.name} — ${source.description}`
        : source.name,
      rate: Number(source.discounted_rate ?? source.default_rate),
    });
  };

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set(
      "items",
      JSON.stringify(
        items.map(({ catalog_item_id, description, quantity, rate }) => ({
          catalog_item_id,
          description,
          quantity,
          rate,
        }))
      )
    );

    startTransition(async () => {
      const result = document
        ? await updateDocument(kind, document.id, formData)
        : await createDocument(kind, formData);
      if (result?.error) setError(result.error);
    });
  };

  const basePath = kind === "invoice" ? "/dashboard/invoices" : "/dashboard/quotations";
  const dateLabel = kind === "invoice" ? "Due date" : "Valid until";

  return (
    <form action={onSubmit} className="space-y-6 max-w-4xl">
      <Card className="p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Client" htmlFor="client_id">
            <select
              id="client_id"
              name="client_id"
              required
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                const client = clients.find((c) => c.id === e.target.value);
                if (client?.currency) setCurrency(client.currency);
              }}
              className={inputClasses}
            >
              <option value="">Select a client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <select
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClasses}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Issue date" htmlFor="issue_date">
            <input
              id="issue_date"
              name="issue_date"
              type="date"
              required
              defaultValue={document?.issue_date ?? new Date().toISOString().slice(0, 10)}
              className={inputClasses}
            />
          </Field>
          <Field label={dateLabel} htmlFor="due_date">
            <input
              id="due_date"
              name="due_date"
              type="date"
              defaultValue={document?.due_date ?? ""}
              className={inputClasses}
            />
          </Field>
        </div>
      </Card>

      {/* Line items */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-body-lg font-semibold">Line items</h2>
          <button type="button" onClick={addItem} className={buttonStyles.secondary}>
            <Plus className="size-4" aria-hidden />
            Add line
          </button>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="grid grid-cols-12 gap-3 items-start pb-4 border-b border-ink/5 last:border-0 last:pb-0"
            >
              <div className="col-span-12 sm:col-span-6">
                {index === 0 && (
                  <label className="block text-small font-medium mb-1.5">Description</label>
                )}
                {catalog.length > 0 && (
                  <select
                    value={item.catalog_item_id ?? ""}
                    onChange={(e) => applyCatalogItem(item.key, e.target.value)}
                    className={`${inputClasses} mb-2 text-small`}
                    aria-label="Fill from catalog"
                  >
                    <option value="">Fill from catalog…</option>
                    {catalog
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} —{" "}
                          {formatMoney(Number(c.discounted_rate ?? c.default_rate), c.currency)}/
                          {c.unit}
                        </option>
                      ))}
                  </select>
                )}
                <textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                  rows={2}
                  required
                  placeholder="What are you billing for?"
                  className={inputClasses}
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                {index === 0 && (
                  <label className="block text-small font-medium mb-1.5">Qty</label>
                )}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(item.key, { quantity: Number(e.target.value) || 0 })
                  }
                  className={inputClasses}
                  aria-label="Quantity"
                />
              </div>

              <div className="col-span-5 sm:col-span-2">
                {index === 0 && (
                  <label className="block text-small font-medium mb-1.5">Rate</label>
                )}
                <input
                  type="number"
                  step="0.01"
                  value={item.rate}
                  onChange={(e) => updateItem(item.key, { rate: Number(e.target.value) || 0 })}
                  className={inputClasses}
                  aria-label="Rate"
                />
              </div>

              <div className="col-span-3 sm:col-span-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  {index === 0 && (
                    <label className="block text-small font-medium mb-1.5">Amount</label>
                  )}
                  <p className="py-2.5 text-small font-medium text-right truncate">
                    {formatMoney(item.quantity * item.rate, currency)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={items.length === 1}
                  aria-label="Remove line"
                  className={`shrink-0 text-ink-subtle hover:text-red-700 disabled:opacity-30 disabled:hover:text-ink-subtle transition-colors ${
                    index === 0 ? "mt-7" : ""
                  }`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tax + totals */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="tax_enabled"
                checked={taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
                className="size-4 accent-citrus cursor-pointer"
              />
              <span className="text-small font-medium">Apply tax to this document</span>
            </label>

            {taxEnabled && (
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <Field label="Tax name" htmlFor="tax_name">
                  <input
                    id="tax_name"
                    name="tax_name"
                    defaultValue={document?.tax_name ?? settings.tax_name}
                    className={inputClasses}
                  />
                </Field>
                <Field label="Rate (%)" htmlFor="tax_rate">
                  <input
                    id="tax_rate"
                    name="tax_rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                    className={inputClasses}
                  />
                </Field>
              </div>
            )}
            {!taxEnabled && (
              <>
                <input type="hidden" name="tax_name" value={settings.tax_name} />
                <input type="hidden" name="tax_rate" value={taxRate} />
              </>
            )}
          </div>

          <div className="lg:w-72 space-y-2.5 lg:border-l lg:border-ink/10 lg:pl-8">
            <div className="flex justify-between text-small">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-medium">{formatMoney(totals.subtotal, currency)}</span>
            </div>
            {taxEnabled && (
              <div className="flex justify-between text-small">
                <span className="text-ink-muted">
                  {document?.tax_name ?? settings.tax_name} ({taxRate}%)
                </span>
                <span className="font-medium">{formatMoney(totals.taxAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2.5 border-t border-ink/10">
              <span className="font-medium">Total</span>
              <span className="font-serif italic text-h3 leading-none">
                {formatMoney(totals.total, currency)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <Field label="Notes" htmlFor="notes" hint="Visible to the client on the document.">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={document?.notes ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field label="Terms" htmlFor="terms">
          <textarea
            id="terms"
            name="terms"
            rows={3}
            defaultValue={document?.terms ?? settings.payment_terms ?? ""}
            className={inputClasses}
          />
        </Field>
      </Card>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {document ? "Save changes" : `Create ${kind}`}
        </button>
        <Link href={basePath} className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
