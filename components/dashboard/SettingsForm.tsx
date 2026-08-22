"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Check } from "lucide-react";
import { updateSettings } from "@/lib/dashboard/actions/settings";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { CURRENCIES, type Settings } from "@/lib/dashboard/types";

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(settings.tax_enabled);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettings(formData);
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  };

  return (
    <form action={onSubmit} className="space-y-6 max-w-2xl">
      <Card className="p-6 space-y-5">
        <h2 className="text-body-lg font-semibold">Business details</h2>
        <p className="text-small text-ink-muted -mt-3">
          Printed at the top of every quotation and invoice.
        </p>

        <Field label="Business name" htmlFor="business_name">
          <input
            id="business_name"
            name="business_name"
            required
            defaultValue={settings.business_name}
            className={inputClasses}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Email" htmlFor="business_email">
            <input
              id="business_email"
              name="business_email"
              defaultValue={settings.business_email ?? ""}
              className={inputClasses}
            />
          </Field>
          <Field label="Phone" htmlFor="business_phone">
            <input
              id="business_phone"
              name="business_phone"
              defaultValue={settings.business_phone ?? ""}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Address" htmlFor="business_address">
          <textarea
            id="business_address"
            name="business_address"
            rows={2}
            defaultValue={settings.business_address ?? ""}
            className={inputClasses}
          />
        </Field>
      </Card>

      <Card className="p-6 space-y-5">
        <h2 className="text-body-lg font-semibold">Tax</h2>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="tax_enabled"
            checked={taxEnabled}
            onChange={(e) => setTaxEnabled(e.target.checked)}
            className="size-4 accent-citrus cursor-pointer"
          />
          <span className="text-small">Apply tax to new documents by default</span>
        </label>

        <p className="text-small text-ink-muted">
          This is only the default. Tax can still be switched on or off on each individual
          quotation and invoice — and documents you&apos;ve already created keep whatever rate they
          were built with, even if you change it here.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Tax name" htmlFor="tax_name" hint="e.g. GST, Sales Tax, VAT">
            <input
              id="tax_name"
              name="tax_name"
              defaultValue={settings.tax_name}
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
              defaultValue={settings.tax_rate}
              className={inputClasses}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h2 className="text-body-lg font-semibold">Documents</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Default currency" htmlFor="default_currency">
            <select
              id="default_currency"
              name="default_currency"
              defaultValue={settings.default_currency}
              className={inputClasses}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invoice prefix" htmlFor="invoice_prefix" hint="INV-2026-001">
            <input
              id="invoice_prefix"
              name="invoice_prefix"
              defaultValue={settings.invoice_prefix}
              className={inputClasses}
            />
          </Field>
          <Field label="Quote prefix" htmlFor="quote_prefix" hint="QUO-2026-001">
            <input
              id="quote_prefix"
              name="quote_prefix"
              defaultValue={settings.quote_prefix}
              className={inputClasses}
            />
          </Field>
        </div>

        <Field label="Payment terms" htmlFor="payment_terms">
          <textarea
            id="payment_terms"
            name="payment_terms"
            rows={2}
            defaultValue={settings.payment_terms ?? ""}
            className={inputClasses}
          />
        </Field>

        <Field
          label="Bank / payment details"
          htmlFor="bank_details"
          hint="Printed on invoices so clients know where to pay."
        >
          <textarea
            id="bank_details"
            name="bank_details"
            rows={4}
            defaultValue={settings.bank_details ?? ""}
            className={inputClasses}
          />
        </Field>
      </Card>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Save settings
        </button>
        {saved && !pending && (
          <span className="flex items-center gap-2 text-small text-green-700">
            <Check className="size-4" aria-hidden />
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
