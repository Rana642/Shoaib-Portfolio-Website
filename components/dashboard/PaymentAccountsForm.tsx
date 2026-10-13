"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { updatePaymentAccounts } from "@/lib/dashboard/actions/settings";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { BankAccount, PaymentAccounts } from "@/lib/payment-accounts";

type Key = keyof BankAccount;
const PK_FIELDS: { key: Key; label: string; hint?: string }[] = [
  { key: "title", label: "Account title" },
  { key: "bank", label: "Bank name" },
  { key: "account", label: "Account number" },
  { key: "iban", label: "IBAN" },
  { key: "branch", label: "Branch (optional)" },
];
const INTL_FIELDS: { key: Key; label: string; hint?: string }[] = [
  { key: "title", label: "Account title" },
  { key: "bank", label: "Bank name" },
  { key: "account", label: "Account number" },
  { key: "iban", label: "IBAN" },
];

/** Settings → Payment accounts: the bank details clients see on every invoice
 *  link and on /pay, where they also upload their transfer receipt. */
export default function PaymentAccountsForm({ accounts }: { accounts: PaymentAccounts }) {
  const [pk, setPk] = useState<BankAccount>({ ...accounts.pk });
  // no separate international account yet → "same as Pakistan" starts ticked
  const [intl, setIntl] = useState<BankAccount & { sameAsPk?: boolean }>({
    ...accounts.intl,
    sameAsPk: accounts.intl.sameAsPk || !(accounts.intl.account || accounts.intl.iban),
  });
  const [note, setNote] = useState(accounts.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updatePaymentAccounts({ pk, intl, note });
      if ("error" in res && res.error) setError(res.error);
      else setSaved(true);
    });
  };

  const input = (prefix: string, value: string | undefined, onChange: (v: string) => void, key: string) => (
    <input
      id={`${prefix}-${key}`}
      value={value ?? ""}
      onChange={(e) => {
        onChange(e.target.value);
        setSaved(false);
      }}
      className={inputClasses}
    />
  );

  return (
    <Card className="p-6 space-y-6 max-w-2xl mt-6">
      <div>
        <h2 className="text-body-lg font-semibold">Payment accounts</h2>
        <p className="text-small text-ink-muted mt-1">
          Shown on every invoice link (PKR invoices get the Pakistan account, other currencies the international one) and
          on <a href="/pay" target="_blank" rel="noreferrer" className="underline underline-offset-4">adsbyshoaib.com/pay</a>,
          where clients upload their transfer receipt for you to confirm.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">Pakistan (PKR)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PK_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} htmlFor={`pk-${f.key}`} hint={f.hint}>
              {input("pk", pk[f.key], (v) => setPk((p) => ({ ...p, [f.key]: v })), f.key)}
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">International</h3>
        <label className="flex items-start gap-3 text-small cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(intl.sameAsPk)}
            onChange={(e) => {
              setIntl((p) => ({ ...p, sameAsPk: e.target.checked }));
              setSaved(false);
            }}
            className="mt-1 size-4 accent-ink"
          />
          <span>
            Same as the Pakistan account — international clients pay to its <strong>IBAN</strong>. Untick when you add a
            separate international account.
          </span>
        </label>
        {!intl.sameAsPk && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {INTL_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`intl-${f.key}`}>
                {input("intl", intl[f.key], (v) => setIntl((p) => ({ ...p, [f.key]: v })), f.key)}
              </Field>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="SWIFT / BIC" htmlFor="intl-swift" hint="Needed for transfers from abroad. Your bank gives you this.">
            {input("intl", intl.swift, (v) => setIntl((p) => ({ ...p, swift: v })), "swift")}
          </Field>
          <Field label="Bank address (optional)" htmlFor="intl-address" hint="Some foreign banks ask for it.">
            {input("intl", intl.address, (v) => setIntl((p) => ({ ...p, address: v })), "address")}
          </Field>
        </div>
      </div>

      <Field label="Note for payers (optional)" htmlFor="pay-note" hint="Shown under the account details.">
        <textarea
          id="pay-note"
          rows={2}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
          placeholder="After the transfer, please upload the receipt below so I can confirm it."
          className={inputClasses}
        />
      </Field>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>
      )}
      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Save payment accounts
        </button>
        {saved && !pending && (
          <span className="flex items-center gap-2 text-small text-green-700">
            <Check className="size-4" aria-hidden />
            Saved
          </span>
        )}
      </div>
    </Card>
  );
}
