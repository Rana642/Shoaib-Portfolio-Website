"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { createCatalogItem, updateCatalogItem } from "@/lib/dashboard/actions/catalog";
import { Field, inputClasses, buttonStyles } from "@/components/dashboard/ui";
import { formatMoney } from "@/lib/dashboard/format";
import { CURRENCIES, UNITS, type CatalogItem } from "@/lib/dashboard/types";

export default function CatalogForm({
  item,
  otherItems,
  memberIds,
  defaultCurrency,
  defaultIsBundle,
}: {
  item?: CatalogItem;
  /** Every other non-bundle service, for the "what's included" picker. */
  otherItems: CatalogItem[];
  /** This bundle's currently-included services, when editing one. */
  memberIds?: string[];
  defaultCurrency: string;
  /** Pre-checks "This is a bundle of services" for a brand-new item
   *  reached from the Bundle Services page. */
  defaultIsBundle?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isBundle, setIsBundle] = useState(item?.is_bundle ?? defaultIsBundle ?? false);
  const [billingType, setBillingType] = useState<"monthly" | "one_time">(
    item?.billing_type ?? ((item?.unit ?? "month") === "month" ? "monthly" : "one_time")
  );
  const [bundlePrice, setBundlePrice] = useState(item?.default_rate ?? 0);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set(memberIds));

  const toggleMember = (id: string, checked: boolean) =>
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const membersTotal = otherItems
    .filter((m) => selectedMemberIds.has(m.id))
    .reduce((sum, m) => sum + Number(m.default_rate), 0);
  const displayCurrency = item?.currency ?? defaultCurrency;

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = item
        ? await updateCatalogItem(item.id, formData)
        : await createCatalogItem(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={onSubmit} className="space-y-5 max-w-2xl">
      <Field
        label="Item name"
        htmlFor="name"
        hint="What appears as the line item on a quotation or invoice."
      >
        <input id="name" name="name" required defaultValue={item?.name} className={inputClasses} />
      </Field>

      <Field label="Description" htmlFor="description" hint="Optional detail under the line item.">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={item?.description ?? ""}
          className={inputClasses}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Field label="Unit" htmlFor="unit">
          <select
            id="unit"
            name="unit"
            defaultValue={item?.unit ?? "month"}
            className={inputClasses}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                per {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label={isBundle ? "Bundle Price" : "Standard Rate"} htmlFor="default_rate">
          <input
            id="default_rate"
            name="default_rate"
            type="number"
            step="0.01"
            min="0"
            required
            value={bundlePrice}
            onChange={(e) => setBundlePrice(Number(e.target.value) || 0)}
            className={inputClasses}
          />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <select
            id="currency"
            name="currency"
            defaultValue={item?.currency ?? defaultCurrency}
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

      {!isBundle && (
        <Field
          label="Billing Type"
          htmlFor="billing_type"
          hint="What a Proposal line defaults to when this service is picked from the catalog."
        >
          <select
            id="billing_type"
            name="billing_type"
            value={billingType}
            onChange={(e) => setBillingType(e.target.value as "monthly" | "one_time")}
            className={`${inputClasses} max-w-xs`}
          >
            <option value="monthly">Monthly Retainer</option>
            <option value="one_time">One-time / Fixed</option>
          </select>
        </Field>
      )}

      <Field label="Sort order" htmlFor="sort_order" hint="Lower numbers appear first in the list.">
        <input
          id="sort_order"
          name="sort_order"
          type="number"
          defaultValue={item?.sort_order ?? 0}
          className={inputClasses}
        />
      </Field>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={item ? item.is_active : true}
          className="size-4 accent-citrus cursor-pointer"
        />
        <span className="text-small">Available when building documents</span>
      </label>

      <div className="border-t border-ink/10 pt-5 space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_bundle"
            checked={isBundle}
            onChange={(e) => setIsBundle(e.target.checked)}
            className="size-4 accent-citrus cursor-pointer"
          />
          <span className="text-small font-medium">This is a bundle of services</span>
        </label>

        {isBundle && (
          <Field
            label="What's included"
            hint="Pick the services in this bundle — the price above is the bundle's own price, not their sum."
          >
            {otherItems.length === 0 ? (
              <p className="text-small text-ink-subtle">
                No other services yet — add some first, then come back to bundle them.
              </p>
            ) : (
              <>
                <div className="border border-ink/15 rounded-lg divide-y divide-ink/5 max-h-64 overflow-y-auto">
                  {otherItems.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-ink/[0.02]"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          name="member_ids"
                          value={member.id}
                          checked={selectedMemberIds.has(member.id)}
                          onChange={(e) => toggleMember(member.id, e.target.checked)}
                          className="size-4 accent-citrus cursor-pointer"
                        />
                        <span className="text-small">{member.name}</span>
                      </span>
                      <span className="text-small text-ink-subtle whitespace-nowrap">
                        {formatMoney(Number(member.default_rate), member.currency)}/{member.unit}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedMemberIds.size > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 mt-3 px-3.5 py-2.5 bg-ink/[0.03] rounded-lg text-small">
                    <span className="text-ink-muted">
                      Combined total if bought separately:{" "}
                      <span className="font-medium text-ink">
                        {formatMoney(membersTotal, displayCurrency)}
                      </span>
                    </span>
                    <span className="text-ink-muted">
                      Bundle price:{" "}
                      <span className="font-medium text-ink">
                        {formatMoney(bundlePrice, displayCurrency)}
                      </span>
                    </span>
                    {bundlePrice < membersTotal && (
                      <span className="text-green-700 font-medium">
                        Saves {formatMoney(membersTotal - bundlePrice, displayCurrency)}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </Field>
        )}
      </div>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {item ? "Save changes" : "Create item"}
        </button>
        <Link
          href={isBundle ? "/dashboard/catalog/bundles" : "/dashboard/catalog"}
          className={buttonStyles.secondary}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
