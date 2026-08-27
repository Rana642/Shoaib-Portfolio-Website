"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createProposal, updateProposal } from "@/lib/dashboard/actions/proposals";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { formatMoney, calculateTotals } from "@/lib/dashboard/format";
import { CURRENCIES, type CatalogItem, type Client, type Settings } from "@/lib/dashboard/types";

type BillingType = "monthly" | "one_time";
type ItemType = "service" | "tool";

type EditableProject = {
  key: string;
  id: string;
  name: string;
  scopeOfWork: string;
};

type EditableItem = {
  key: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  rate: number;
  billing_type: BillingType;
  item_type: ItemType;
  project_id: string | null;
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
  discount_enabled: boolean;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  tax_enabled: boolean;
  tax_name: string;
  tax_rate: number;
  tools_tax_enabled: boolean;
  tools_tax_rate: number;
  terms: string | null;
  projects: { id: string; name: string; scope_of_work: string | null }[];
  items: {
    catalog_item_id: string | null;
    description: string;
    quantity: number;
    rate: number;
    billing_type: BillingType;
    item_type: ItemType;
    project_id: string | null;
  }[];
};

let keyCounter = 0;
const nextKey = () => `item-${keyCounter++}`;

// Starting drafts for a brand-new proposal — professional, fully editable,
// not fixed boilerplate. Saves starting from a blank page every time.
const DEFAULT_SITUATION =
  "Every business reaches a point where growth needs more than ad-hoc effort — a real system for visibility, content, and conversion tracking working together. That's the stage you're at right now: real potential, without yet a joined-up strategy turning attention into measurable results.";
const DEFAULT_PROPOSED_SOLUTION =
  "This plan is built around what actually moves the needle for your business specifically — not a fixed package, but the mix of brand presence, content, tracking, and paid media that fits where you are today.";
const DEFAULT_SCOPE_OF_WORK =
  "The exact scope is itemized under Service Charges below — each line scoped specifically to this engagement, not a generic bundle.";
const DEFAULT_TERMS =
  "50% due upon signing the agreement, 50% due upon delivery of the first milestone, unless otherwise agreed in writing. This proposal is valid for 14 days from the date sent.";

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
  const [discountEnabled, setDiscountEnabled] = useState(proposal?.discount_enabled ?? false);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">(
    proposal?.discount_type ?? "percentage"
  );
  const [discountValue, setDiscountValue] = useState(proposal?.discount_value ?? 0);
  const [taxEnabled, setTaxEnabled] = useState(proposal?.tax_enabled ?? settings.tax_enabled);
  const [taxRate, setTaxRate] = useState(proposal?.tax_rate ?? settings.tax_rate);
  const [toolsTaxEnabled, setToolsTaxEnabled] = useState(proposal?.tools_tax_enabled ?? false);
  const [toolsTaxRate, setToolsTaxRate] = useState(proposal?.tools_tax_rate ?? 18);
  const [projects, setProjects] = useState<EditableProject[]>(
    proposal?.projects.map((p) => ({ key: nextKey(), id: p.id, name: p.name, scopeOfWork: p.scope_of_work ?? "" })) ?? []
  );
  const [items, setItems] = useState<EditableItem[]>(
    proposal?.items.map((item) => ({ ...item, key: nextKey() })) ?? [
      {
        key: nextKey(),
        catalog_item_id: null,
        description: "",
        quantity: 1,
        rate: 0,
        billing_type: "one_time",
        item_type: "service",
        project_id: null,
      },
    ]
  );

  const totals = useMemo(
    () =>
      calculateTotals(
        items,
        taxEnabled,
        taxRate,
        { enabled: discountEnabled, type: discountType, value: discountValue },
        { enabled: toolsTaxEnabled, rate: toolsTaxRate }
      ),
    [items, taxEnabled, taxRate, discountEnabled, discountType, discountValue, toolsTaxEnabled, toolsTaxRate]
  );

  const updateItem = (key: string, patch: Partial<EditableItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addItem = (itemType: ItemType) =>
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        catalog_item_id: null,
        description: "",
        quantity: 1,
        rate: 0,
        billing_type: itemType === "tool" ? "monthly" : "one_time",
        item_type: itemType,
        project_id: null,
      },
    ]);

  const removeItem = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((item) => item.key !== key)));

  const addProject = () =>
    setProjects((prev) => [...prev, { key: nextKey(), id: crypto.randomUUID(), name: "", scopeOfWork: "" }]);

  const updateProject = (key: string, patch: Partial<EditableProject>) =>
    setProjects((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const removeProject = (key: string) => {
    const removed = projects.find((p) => p.key === key);
    setProjects((prev) => prev.filter((p) => p.key !== key));
    if (removed) {
      setItems((prev) =>
        prev.map((item) => (item.project_id === removed.id ? { ...item, project_id: null } : item))
      );
    }
  };

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
      billing_type: source.unit === "month" ? "monthly" : "one_time",
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

  const toolItems = items.filter((item) => item.item_type === "tool");

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set(
      "projects",
      JSON.stringify(
        projects.map(({ id, name, scopeOfWork }) => ({ id, name, scope_of_work: scopeOfWork || null }))
      )
    );
    formData.set(
      "items",
      JSON.stringify(
        items.map(({ catalog_item_id, description, quantity, rate, billing_type, item_type, project_id }) => ({
          catalog_item_id,
          description,
          quantity,
          rate,
          billing_type,
          item_type,
          project_id,
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
            defaultValue={proposal?.situation ?? DEFAULT_SITUATION}
            className={inputClasses}
          />
        </Field>
        <Field label="Proposed solution" htmlFor="proposed_solution" hint="The approach — why this, why you.">
          <textarea
            id="proposed_solution"
            name="proposed_solution"
            rows={4}
            defaultValue={proposal?.proposed_solution ?? DEFAULT_PROPOSED_SOLUTION}
            className={inputClasses}
          />
        </Field>
        <Field label="Scope of work" htmlFor="scope_of_work" hint="What's actually included, concretely.">
          <textarea
            id="scope_of_work"
            name="scope_of_work"
            rows={4}
            defaultValue={proposal?.scope_of_work ?? DEFAULT_SCOPE_OF_WORK}
            className={inputClasses}
          />
        </Field>
      </Card>

      {/* Projects / companies */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-body-lg font-semibold">Projects</h2>
            <p className="text-small text-ink-muted mt-1">
              If this client has more than one project or company, break the charges out per
              project below — pricing still adds up per project, you can still land on one final
              number in Discount below.
            </p>
          </div>
          <button type="button" onClick={addProject} className={buttonStyles.secondary}>
            <Plus className="size-4" aria-hidden />
            Add project
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="text-small text-ink-subtle">
            No projects added — charges below apply to this proposal as a whole.
          </p>
        ) : (
          <div className="space-y-5">
            {projects.map((project, index) => (
              <div key={project.key} className="pb-5 border-b border-ink/5 last:border-0 last:pb-0 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <Field label={`Project ${index + 1} name`} htmlFor={`project-name-${project.key}`}>
                      <input
                        id={`project-name-${project.key}`}
                        required
                        value={project.name}
                        onChange={(e) => updateProject(project.key, { name: e.target.value })}
                        placeholder="e.g. Avenza Restaurant"
                        className={inputClasses}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProject(project.key)}
                    aria-label="Remove project"
                    className="shrink-0 mt-7 text-ink-subtle hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <Field
                  label="Scope of work for this project"
                  htmlFor={`project-scope-${project.key}`}
                  hint="Optional — what's specifically included for this one."
                >
                  <textarea
                    id={`project-scope-${project.key}`}
                    value={project.scopeOfWork}
                    onChange={(e) => updateProject(project.key, { scopeOfWork: e.target.value })}
                    rows={2}
                    className={inputClasses}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Service charges */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-body-lg font-semibold">Service Charges</h2>
          <button type="button" onClick={() => addItem("service")} className={buttonStyles.secondary}>
            <Plus className="size-4" aria-hidden />
            Add line
          </button>
        </div>

        <div className="space-y-4">
          {items.filter((item) => item.item_type === "service").map((item, index) => (
            <div
              key={item.key}
              className="grid grid-cols-12 gap-3 items-start pb-4 border-b border-ink/5 last:border-0 last:pb-0"
            >
              <div className="col-span-12 sm:col-span-6">
                {index === 0 && (
                  <label className="block text-small font-medium mb-1.5">Description</label>
                )}
                <div className="flex flex-wrap gap-2 mb-2">
                  {catalog.length > 0 && (
                    <select
                      value={item.catalog_item_id ?? ""}
                      onChange={(e) => applyCatalogItem(item.key, e.target.value)}
                      className={`${inputClasses} text-small flex-1 min-w-0`}
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
                  <select
                    value={item.billing_type}
                    onChange={(e) =>
                      updateItem(item.key, { billing_type: e.target.value as BillingType })
                    }
                    className={`${inputClasses} text-small ${catalog.length > 0 ? "w-44 shrink-0" : "flex-1"}`}
                    aria-label="Billing type"
                  >
                    <option value="monthly">Monthly Retainer</option>
                    <option value="one_time">One-time / Fixed</option>
                  </select>
                  {projects.length > 0 && (
                    <select
                      value={item.project_id ?? ""}
                      onChange={(e) => updateItem(item.key, { project_id: e.target.value || null })}
                      className={`${inputClasses} text-small w-44 shrink-0`}
                      aria-label="Project"
                    >
                      <option value="">General (all projects)</option>
                      {projects.map((p) => (
                        <option key={p.key} value={p.id}>
                          {p.name || "Untitled project"}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
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

      {/* Tools & subscriptions */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-body-lg font-semibold">Tools &amp; Subscriptions</h2>
            <p className="text-small text-ink-muted mt-1">
              Third-party software you&apos;re passing through — Canva, ad tools, AI subscriptions, etc.
            </p>
          </div>
          <button type="button" onClick={() => addItem("tool")} className={buttonStyles.secondary}>
            <Plus className="size-4" aria-hidden />
            Add tool
          </button>
        </div>

        {toolItems.length > 0 && (
          <div className="space-y-4">
            {toolItems.map((item, index) => (
              <div
                key={item.key}
                className="grid grid-cols-12 gap-3 items-start pb-4 border-b border-ink/5 last:border-0 last:pb-0"
              >
                <div className="col-span-12 sm:col-span-6">
                  {index === 0 && (
                    <label className="block text-small font-medium mb-1.5">Tool / subscription</label>
                  )}
                  {projects.length > 0 && (
                    <select
                      value={item.project_id ?? ""}
                      onChange={(e) => updateItem(item.key, { project_id: e.target.value || null })}
                      className={`${inputClasses} text-small mb-2 w-44`}
                      aria-label="Project"
                    >
                      <option value="">General (all projects)</option>
                      {projects.map((p) => (
                        <option key={p.key} value={p.id}>
                          {p.name || "Untitled project"}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    rows={2}
                    required
                    placeholder="e.g. Claude Pro subscription"
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
                    aria-label="Remove tool"
                    className={`shrink-0 text-ink-subtle hover:text-red-700 transition-colors ${
                      index === 0 ? "mt-7" : ""
                    }`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {toolItems.length > 0 ? (
          <div className="mt-5 pt-5 border-t border-ink/10 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="tools_tax_enabled"
                checked={toolsTaxEnabled}
                onChange={(e) => setToolsTaxEnabled(e.target.checked)}
                className="size-4 accent-citrus cursor-pointer"
              />
              <span className="text-small font-medium">
                Disclose estimated international transaction tax
              </span>
            </label>
            <p className="text-small text-ink-subtle -mt-2 max-w-lg">
              Pakistani accounts are typically charged this on international card purchases —
              shown as an estimate since the actual rate varies by bank.
            </p>
            {toolsTaxEnabled ? (
              <Field
                label="Estimated rate (%)"
                htmlFor="tools_tax_rate"
                hint="Applies only to the tools above, not your service fees."
              >
                <input
                  id="tools_tax_rate"
                  name="tools_tax_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={toolsTaxRate}
                  onChange={(e) => setToolsTaxRate(Number(e.target.value) || 0)}
                  className={`${inputClasses} max-w-[10rem]`}
                />
              </Field>
            ) : (
              <input type="hidden" name="tools_tax_rate" value={toolsTaxRate} />
            )}
          </div>
        ) : (
          <input type="hidden" name="tools_tax_rate" value={toolsTaxRate} />
        )}
      </Card>

      {/* Discount + tax + totals */}
      <Card className="p-6">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-5">
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
                  <Field label={discountType === "percentage" ? "Rate (%)" : `Amount (${currency})`} htmlFor="discount_value">
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
            {discountEnabled && totals.discountAmount > 0 && (
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
                  {proposal?.tax_name ?? settings.tax_name} ({taxRate}%)
                </span>
                <span className="font-medium">{formatMoney(totals.taxAmount, currency)}</span>
              </div>
            )}
            {toolsTaxEnabled && totals.toolsTaxAmount > 0 && (
              <div className="flex justify-between text-small">
                <span className="text-ink-muted">Est. intl. transaction tax ({toolsTaxRate}%)</span>
                <span className="font-medium">{formatMoney(totals.toolsTaxAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2.5 border-t border-ink/10">
              <span className="font-medium">Total</span>
              <span className="font-serif italic text-h3 leading-none">
                {formatMoney(totals.total, currency)}
              </span>
            </div>
            {toolsTaxEnabled && totals.toolsTaxAmount > 0 && (
              <p className="text-tag text-ink-subtle pt-1">
                *International transaction tax is estimated and may vary by bank at time of payment.
              </p>
            )}
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
            defaultValue={proposal?.terms ?? DEFAULT_TERMS}
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
