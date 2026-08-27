"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { createCatalogItem, updateCatalogItem } from "@/lib/dashboard/actions/catalog";
import { Field, inputClasses, buttonStyles } from "@/components/dashboard/ui";
import { CURRENCIES, UNITS, type CatalogItem } from "@/lib/dashboard/types";

export default function CatalogForm({
  item,
  defaultCurrency,
}: {
  item?: CatalogItem;
  defaultCurrency: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
        <Field label="Standard Rate" htmlFor="default_rate">
          <input
            id="default_rate"
            name="default_rate"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={item?.default_rate ?? 0}
            className={inputClasses}
          />
        </Field>
        <Field
          label="Your Rate"
          htmlFor="discounted_rate"
          hint="Optional — what you actually tend to quote. Left blank if there's no second tier."
        >
          <input
            id="discounted_rate"
            name="discounted_rate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item?.discounted_rate ?? ""}
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
        <Link href="/dashboard/catalog" className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
