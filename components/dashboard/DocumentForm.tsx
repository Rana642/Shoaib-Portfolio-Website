"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { GripVertical, ListChecks, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createDocument, updateDocument } from "@/lib/dashboard/actions/documents";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { formatMoney, calculateTotals } from "@/lib/dashboard/format";
import { CURRENCIES, type CatalogItem, type Client, type Settings } from "@/lib/dashboard/types";
import { countableFor, readCount, writeCount } from "@/lib/dashboard/countable";
import CountStepper from "@/components/dashboard/CountStepper";

type EditableItem = {
  key: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  is_complimentary: boolean;
};

type ExistingDocument = {
  id: string;
  client_id: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  discount_enabled?: boolean;
  discount_type?: "percentage" | "fixed";
  discount_value?: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  notes: string | null;
  terms: string | null;
  items: {
    catalog_item_id: string | null;
    description: string;
    quantity: number;
    rate: number;
    is_complimentary?: boolean;
  }[];
};

let keyCounter = 0;
const nextKey = () => `item-${keyCounter++}`;

export default function DocumentForm({
  kind,
  clients,
  catalog,
  bundleMembers = {},
  bundleTotals = {},
  settings,
  document,
}: {
  kind: "quotation" | "invoice";
  clients: Client[];
  catalog: CatalogItem[];
  /** catalog item id -> names of the services included, for bundles. */
  bundleMembers?: Record<string, string[]>;
  /** bundle id -> combined total of its included services' own rates. */
  bundleTotals?: Record<string, number>;
  settings: Settings;
  document?: ExistingDocument;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [clientId, setClientId] = useState(document?.client_id ?? "");
  const [currency, setCurrency] = useState(document?.currency ?? settings.default_currency);
  const [discountEnabled, setDiscountEnabled] = useState(document?.discount_enabled ?? false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    document?.discount_type ?? "percentage"
  );
  const [discountValue, setDiscountValue] = useState(document?.discount_value ?? 0);
  const [taxEnabled, setTaxEnabled] = useState(document?.tax_enabled ?? settings.tax_enabled);
  const [taxRate, setTaxRate] = useState(document?.tax_rate ?? settings.tax_rate);
  const [items, setItems] = useState<EditableItem[]>(
    document?.items.map((item) => ({ ...item, is_complimentary: item.is_complimentary ?? false, key: nextKey() })) ?? [
      { key: nextKey(), catalog_item_id: null, description: "", quantity: 1, rate: 0, is_complimentary: false },
    ]
  );

  const isQuotation = kind === "quotation";

  const totals = useMemo(
    () =>
      calculateTotals(
        items,
        taxEnabled,
        taxRate,
        isQuotation ? { enabled: discountEnabled, type: discountType, value: discountValue } : undefined
      ),
    [items, taxEnabled, taxRate, isQuotation, discountEnabled, discountType, discountValue]
  );

  const updateItem = (key: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { key: nextKey(), catalog_item_id: null, description: "", quantity: 1, rate: 0, is_complimentary: false },
    ]);

  const removeItem = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((item) => item.key !== key)));

  /** Picking a catalog item fills description and rate, but both stay
   *  editable — the document keeps its own copy, so later catalog edits
   *  never rewrite an already-sent document. */
  const lineFromCatalog = (source: CatalogItem): Partial<EditableItem> => {
    const members = bundleMembers[source.id];
    const bundleTotal = bundleTotals[source.id];
    const description = source.is_bundle
      ? `${source.name} — includes: ${members?.join(", ") || "see catalog"}${
          bundleTotal
            ? ` (combined value ${formatMoney(bundleTotal, source.currency)}, bundled at ${formatMoney(Number(source.default_rate), source.currency)})`
            : ""
        }`
      : source.description
        ? `${source.name} — ${source.description}`
        : source.name;
    return {
      catalog_item_id: source.id,
      description,
      rate: Number(source.default_rate),
      // Countable services are billed as one package, never per unit.
      ...(source.count_label ? { quantity: 1 } : {}),
    };
  };

  const applyCatalogItem = (key: string, catalogId: string) => {
    if (!catalogId) {
      updateItem(key, { catalog_item_id: null });
      return;
    }
    const source = catalog.find((c) => c.id === catalogId);
    if (!source) return;
    updateItem(key, lineFromCatalog(source));
  };

  // Multi-add picker: tick several catalog services, add them as lines in one go.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const addPickedServices = () => {
    const sources = picked
      .map((id) => catalog.find((c) => c.id === id))
      .filter((c): c is CatalogItem => Boolean(c));
    if (sources.length > 0) {
      setItems((prev) => {
        // A lone blank line is just the starting placeholder: replace it.
        const blank =
          prev.length === 1 && !prev[0].catalog_item_id && !prev[0].description.trim() ? prev[0].key : null;
        const kept = blank ? [] : prev;
        const added: EditableItem[] = sources.map((source) => ({
          key: nextKey(),
          catalog_item_id: null,
          description: "",
          quantity: 1,
          rate: 0,
          is_complimentary: false,
          ...lineFromCatalog(source),
        }));
        return [...kept, ...added];
      });
    }
    setPicked([]);
    setPickerOpen(false);
  };

  // Drag to reorder lines. A row is only draggable while its grip is held,
  // so text in the row's fields stays selectable.
  const [dragArmed, setDragArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const moveItem = (fromKey: string, toKey: string) =>
    setItems((prev) => {
      const from = prev.findIndex((item) => item.key === fromKey);
      const to = prev.findIndex((item) => item.key === toKey);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set(
      "items",
      JSON.stringify(
        items.map(({ catalog_item_id, description, quantity, rate, is_complimentary }) => ({
          catalog_item_id,
          description,
          quantity,
          rate,
          is_complimentary,
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
          <div className="flex flex-wrap gap-2">
            {catalog.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPicked([]);
                  setPickerOpen((open) => !open);
                }}
                className={buttonStyles.secondary}
              >
                <ListChecks className="size-4" aria-hidden />
                Add services
              </button>
            )}
            <button type="button" onClick={addItem} className={buttonStyles.secondary}>
              <Plus className="size-4" aria-hidden />
              Add line
            </button>
          </div>
        </div>

        {pickerOpen && (
          <div className="mb-5 rounded-xl border border-ink/10 bg-white/80 p-4">
            <p className="text-small font-semibold mb-3">Tick the services to add</p>
            <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
              {[
                { label: "Services", list: catalog.filter((c) => c.is_active && !c.is_bundle) },
                { label: "Bundles", list: catalog.filter((c) => c.is_active && c.is_bundle) },
              ]
                .filter((group) => group.list.length > 0)
                .map((group) => (
                  <div key={group.label}>
                    <p className="text-tag font-semibold uppercase tracking-widest text-ink-muted mb-1.5">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {group.list.map((c) => (
                        <label key={c.id} className="flex items-start gap-2 text-small py-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={picked.includes(c.id)}
                            onChange={(e) =>
                              setPicked((prev) =>
                                e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                              )
                            }
                            className="size-4 mt-0.5 accent-ink shrink-0"
                          />
                          <span>
                            {c.name}{" "}
                            <span className="text-ink-muted">
                              {formatMoney(Number(c.default_rate), c.currency)}/{c.unit}
                              {items.some((item) => item.catalog_item_id === c.id) ? " · already added" : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={addPickedServices}
                disabled={picked.length === 0}
                className={buttonStyles.primary}
              >
                Add {picked.length > 0 ? picked.length : ""} service{picked.length === 1 ? "" : "s"}
              </button>
              <button type="button" onClick={() => setPickerOpen(false)} className={buttonStyles.secondary}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {items.map((item, index) => (
            <div
              key={item.key}
              draggable={dragArmed === item.key}
              onDragStart={(e) => {
                setDragging(item.key);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragging) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) moveItem(dragging, item.key);
                setDragging(null);
                setDragArmed(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDragArmed(null);
              }}
              className={`relative grid grid-cols-12 gap-3 items-start pb-4 pl-6 border-b border-ink/5 last:border-0 last:pb-0 ${
                dragging === item.key ? "opacity-40" : ""
              }`}
            >
              <button
                type="button"
                aria-label="Drag to reorder"
                title="Drag to reorder"
                onMouseDown={() => setDragArmed(item.key)}
                onMouseUp={() => setDragArmed(null)}
                className={`absolute left-0 ${index === 0 ? "top-8" : "top-1.5"} cursor-grab active:cursor-grabbing text-ink-subtle hover:text-ink`}
              >
                <GripVertical className="size-4" aria-hidden />
              </button>
              {/* A countable line gives two columns of Description to its stepper. */}
              <div className={`col-span-12 ${countableFor(catalog, item.catalog_item_id) ? "sm:col-span-4" : "sm:col-span-6"}`}>
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
                    {catalog.filter((c) => c.is_active && !c.is_bundle).length > 0 && (
                      <optgroup label="Services">
                        {catalog
                          .filter((c) => c.is_active && !c.is_bundle)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {formatMoney(Number(c.default_rate), c.currency)}/{c.unit}
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {catalog.filter((c) => c.is_active && c.is_bundle).length > 0 && (
                      <optgroup label="Bundles">
                        {catalog
                          .filter((c) => c.is_active && c.is_bundle)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} — {formatMoney(Number(c.default_rate), c.currency)}/{c.unit}
                            </option>
                          ))}
                      </optgroup>
                    )}
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
                <label className="mt-2 inline-flex items-center gap-2 text-small text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.is_complimentary}
                    onChange={(e) => updateItem(item.key, { is_complimentary: e.target.checked })}
                    className="size-4 accent-ink"
                  />
                  Complimentary: show its value, don&apos;t charge it
                </label>
              </div>

              {(() => {
                // Countable services (posts, ...) swap Qty for a count
                // stepper that rewrites the number in the description. Rate
                // stays editable: invoices have no discount, so the agreed
                // price must be billable on the line itself.
                const countable = countableFor(catalog, item.catalog_item_id);
                if (countable) {
                  const label = countable.label;
                  return (
                    <div className="col-span-7 sm:col-span-4">
                      <CountStepper
                        label={label}
                        count={readCount(item.description, label) ?? countable.fallback}
                        onChange={(count) =>
                          updateItem(item.key, { description: writeCount(item.description, label, count) })
                        }
                        showLabel={index === 0}
                      />
                    </div>
                  );
                }
                return (
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
                );
              })()}

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
                  <p
                    className={`pt-2.5 text-small font-medium text-right truncate ${
                      item.is_complimentary ? "text-ink-muted line-through" : "pb-2.5"
                    }`}
                  >
                    {formatMoney(item.quantity * item.rate, currency)}
                  </p>
                  {item.is_complimentary && (
                    <p className="text-tag font-semibold text-right text-ink">Complimentary</p>
                  )}
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

      {/* Discount (quotations only) + tax + totals */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-5">
            {isQuotation && (
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="discount_enabled"
                    checked={discountEnabled}
                    onChange={(e) => setDiscountEnabled(e.target.checked)}
                    className="size-4 accent-citrus cursor-pointer"
                  />
                  <span className="text-small font-medium">Offer a discount on the total</span>
                </label>

                {discountEnabled && (
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <Field label="Type" htmlFor="discount_type">
                      <select
                        id="discount_type"
                        name="discount_type"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                        className={inputClasses}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    </Field>
                    <Field
                      label={discountType === "percentage" ? "Rate (%)" : `Amount (${currency})`}
                      htmlFor="discount_value"
                    >
                      <input
                        id="discount_value"
                        name="discount_value"
                        type="number"
                        step="0.01"
                        min="0"
                        max={discountType === "percentage" ? 100 : undefined}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                        className={inputClasses}
                      />
                    </Field>
                  </div>
                )}
                {!discountEnabled && (
                  <>
                    <input type="hidden" name="discount_type" value={discountType} />
                    <input type="hidden" name="discount_value" value={discountValue} />
                  </>
                )}
              </div>
            )}

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
            {isQuotation && discountEnabled && totals.discountAmount > 0 && (
              <div className="flex justify-between text-small">
                <span className="text-ink-muted">
                  Discount {discountType === "percentage" ? `(${discountValue}%)` : ""}
                </span>
                <span className="font-medium">−{formatMoney(totals.discountAmount, currency)}</span>
              </div>
            )}
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
