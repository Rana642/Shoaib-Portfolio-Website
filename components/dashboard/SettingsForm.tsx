"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Check } from "lucide-react";
import { updateSettings } from "@/lib/dashboard/actions/settings";
import { Field, inputClasses, buttonStyles, SettingsCard } from "@/components/dashboard/ui";
import { CURRENCIES, type Settings } from "@/lib/dashboard/types";

/**
 * The `settings` row, in two parts that live where they're used:
 * "business" = Settings → Business profile (name, email, phone, address);
 * "billing" = Finance → Setup (tax, currency, numbering, payment terms).
 * Each part only saves its own fields.
 */
export default function SettingsForm({ settings, part }: { settings: Settings; part: "business" | "billing" }) {
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
    <form action={onSubmit} className="space-y-6">
      <input type="hidden" name="_part" value={part} />

      {part === "business" && (
        <SettingsCard title="Business details" description="Printed at the top of every quotation and invoice.">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            <Field label="Business name" htmlFor="business_name">
              <input id="business_name" name="business_name" required defaultValue={settings.business_name} className={inputClasses} />
            </Field>
            <Field label="Email" htmlFor="business_email">
              <input id="business_email" name="business_email" defaultValue={settings.business_email ?? ""} className={inputClasses} />
            </Field>
            <Field label="Phone" htmlFor="business_phone">
              <input id="business_phone" name="business_phone" defaultValue={settings.business_phone ?? ""} className={inputClasses} />
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
        </SettingsCard>
      )}

      {part === "billing" && (
        <>
          <SettingsCard
            title="Tax"
            description={
              <>
                This is only the default. Tax can still be switched on or off on each individual quotation and invoice — and
                documents you&apos;ve already created keep whatever rate they were built with, even if you change it here.
              </>
            }
          >
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              <Field label="Tax name" htmlFor="tax_name" hint="e.g. GST, Sales Tax, VAT">
                <input id="tax_name" name="tax_name" defaultValue={settings.tax_name} className={inputClasses} />
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
          </SettingsCard>

          <SettingsCard
            title="Documents"
            description="The default currency, how proposals, agreements, quotations and invoices are numbered, and the terms printed on them."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              <Field label="Default currency" htmlFor="default_currency">
                <select id="default_currency" name="default_currency" defaultValue={settings.default_currency} className={inputClasses}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Proposal prefix" htmlFor="proposal_prefix" hint="PRO-2026-001">
                <input id="proposal_prefix" name="proposal_prefix" defaultValue={settings.proposal_prefix} className={inputClasses} />
              </Field>
              <Field label="Agreement prefix" htmlFor="agreement_prefix" hint="AGR-2026-001">
                <input id="agreement_prefix" name="agreement_prefix" defaultValue={settings.agreement_prefix} className={inputClasses} />
              </Field>
              <Field label="Invoice prefix" htmlFor="invoice_prefix" hint="INV-2026-001">
                <input id="invoice_prefix" name="invoice_prefix" defaultValue={settings.invoice_prefix} className={inputClasses} />
              </Field>
              <Field label="Quote prefix" htmlFor="quote_prefix" hint="QUO-2026-001">
                <input id="quote_prefix" name="quote_prefix" defaultValue={settings.quote_prefix} className={inputClasses} />
              </Field>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <Field label="Payment terms" htmlFor="payment_terms">
                <textarea
                  id="payment_terms"
                  name="payment_terms"
                  rows={4}
                  defaultValue={settings.payment_terms ?? ""}
                  className={inputClasses}
                />
              </Field>
              <Field
                label="Bank / payment details (old)"
                htmlFor="bank_details"
                hint="Only printed on invoices while no payment account is saved above."
              >
                <textarea
                  id="bank_details"
                  name="bank_details"
                  rows={4}
                  defaultValue={settings.bank_details ?? ""}
                  className={inputClasses}
                />
              </Field>
            </div>
          </SettingsCard>
        </>
      )}

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>
      )}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {part === "business" ? "Save business details" : "Save tax and documents"}
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
