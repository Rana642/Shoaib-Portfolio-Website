"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createProposal, updateProposal } from "@/lib/dashboard/actions/proposals";
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

type ExistingProposal = {
  id: string;
  client_id: string | null;
  prospect_name: string;
  prospect_email: string;
  prospect_business: string | null;
  situation: string | null;
  proposed_solution: string | null;
  scope_of_work: string | null;
  currency: string;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  terms: string | null;
  items: { catalog_item_id: string | null; description: string; quantity: number; rate: number }[];
};

let keyCounter = 0;
const nextKey = () => `item-${keyCounter++}`;

export default function ProposalForm({
  clients,
  catalog,
  settings,
  proposal,
  prefill,
}: {
  clients: Client[];
  catalog: CatalogItem[];
  settings: Settings;
  proposal?: ExistingProposal;
  /** Prefill from a contact-form lead when arriving via "New proposal" on the Leads page. */
  prefill?: { name?: string; email?: string; business?: string };
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [clientId, setClientId] = useState(proposal?.client_id ?? "");
  const [prospectName, setProspectName] = useState(proposal?.prospect_name ?? prefill?.name ?? "");
  const [prospectEmail, setProspectEmail] = useState(proposal?.prospect_email ?? prefill?.email ?? "");
  const [prospectBusiness, setProspectBusiness] = useState(
    proposal?.prospect_business ?? prefill?.business ?? ""
  );
  const [currency, setCurrency] = useState(proposal?.currency ?? settings.default_currency);
  const [taxEnabled, setTaxEnabled] = useState(proposal?.tax_enabled ?? settings.tax_enabled);
  const [taxRate, setTaxRate] = useState(proposal?.tax_rate ?? settings.tax_rate);
  const [items, setItems] = useState<EditableItem[]>(
    proposal?.items.map((item) => ({ ...item, key: nextKey() })) ?? [
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

  const applyCatalogItem = (key: string, catalogId: string) => {
    if (!catalogId) {
      updateItem(key, { catalog_item_id: null });
      return;
    }
    const source = catalog.find((c) => c.id === catalogId);
    if (!source) return;
    updateItem(key, {
      catalog_item_id: source.id,
      description: source.description ? `${source.name} — ${source.description}` : source.name,
      rate: Number(source.default_rate),
    });
  };

  const onSelectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client) {
      setProspectName(client.contact_person || client.name);
      setProspectEmail(client.email ?? "");
      setProspectBusiness(client.name);
      if (client.currency) setCurrency(client.currency);
    }
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
      const result = proposal
        ? await updateProposal(proposal.id, formData)
        : await createProposal(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={onSubmit} className="space-y-6 max-w-4xl">
      <Card className="p-6 space-y-5">
        <h2 className="text-body-lg font-semibold">Who&apos;s this for?</h2>

        {clients.length > 0 && (
          <Field
            label="Existing client (optional)"
            htmlFor="client_id"
            hint="Pick one to prefill their details, or leave blank for a new prospect."
          >
            <select
              id="client_id"
              name="client_id"
              value={clientId}
              onChange={(e) => onSelectClient(e.target.value)}
              className={inputClasses}
            >
              <option value="">New prospect…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Contact name" htmlFor="prospect_name">
            <input
              id="prospect_name"
              name="prospect_name"
              required
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Email" htmlFor="prospect_email">
            <input
              id="prospect_email"
              name="prospect_email"
              type="email"
              required
              value={prospectEmail}
              onChange={(e) => setProspectEmail(e.target.value)}
              className={inputClasses}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Business" htmlFor="prospect_business">
            <input
              id="prospect_business"
              name="prospect_business"
              value={prospectBusiness}
              onChange={(e) => setProspectBusiness(e.target.value)}
              className={inputClasses}
            />
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
      </Card>

      <Card className="p-6 space-y-5">
        <h2 className="text-body-lg font-semibold">The pitch</h2>
        <p className="text-small text-ink-muted -mt-3">
          Framed around their specific need, not a fixed package — this is what makes it a
          proposal, not just a quote.
        </p>
        <Field label="Their situation" htmlFor="situation" hint="What's going on for them right now.">
          <textarea
            id="situation"
            name="situation"
            rows={3}
            defaultValue={proposal?.situation ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field label="Proposed solution" htmlFor="proposed_solution" hint="The approach — why this, why you.">
          <textarea
            id="proposed_solution"
            name="proposed_solution"
            rows={4}
            defaultValue={proposal?.proposed_solution ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field label="Scope of work" htmlFor="scope_of_work" hint="What's actually included, concretely.">
          <textarea
            id="scope_of_work"
            name="scope_of_work"
            rows={4}
            defaultValue={proposal?.scope_of_work ?? ""}
            className={inputClasses}
          />
        </Field>
      </Card>

      {/* Line items */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-body-lg font-semibold">Investment</h2>
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
                          {c.name} — {formatMoney(Number(c.default_rate), c.currency)}/{c.unit}
                        </option>
                      ))}
                  </select>
                )}
                <textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                  rows={2}
                  required
                  placeholder="What are you proposing?"
                  className={inputClasses}
                />
              </div>

              <div className="col-span-4 sm:col-span-2">
                {index === 0 && <label className="block text-small font-medium mb-1.5">Qty</label>}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) || 0 })}
                  className={inputClasses}
                  aria-label="Quantity"
                />
              </div>

              <div className="col-span-5 sm:col-span-2">
                {index === 0 && <label className="block text-small font-medium mb-1.5">Rate</label>}
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
              <span className="text-small font-medium">Apply tax to this proposal</span>
            </label>

            {taxEnabled && (
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <Field label="Tax name" htmlFor="tax_name">
                  <input
                    id="tax_name"
                    name="tax_name"
                    defaultValue={proposal?.tax_name ?? settings.tax_name}
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
                  {proposal?.tax_name ?? settings.tax_name} ({taxRate}%)
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
        <Field
          label="Terms"
          htmlFor="terms"
          hint="This becomes binding once the prospect accepts — payment terms, timeline, cancellation, etc."
        >
          <textarea
            id="terms"
            name="terms"
            rows={4}
            defaultValue={proposal?.terms ?? settings.payment_terms ?? ""}
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
          {proposal ? "Save changes" : "Create proposal"}
        </button>
        <Link href="/dashboard/proposals" className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
