"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { formatMoney } from "@/lib/dashboard/format";

export default function PaymentForm({
  action,
  currency,
  balanceDue,
}: {
  action: (formData: FormData) => Promise<{ error?: string; ok?: boolean }>;
  currency: string;
  balanceDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) setError(result.error);
      else setOpen(false);
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonStyles.secondary}>
        <Plus className="size-4" aria-hidden />
        Record payment
      </button>
    );
  }

  return (
    <Card className="p-6 max-w-lg">
      <h3 className="text-body-lg font-semibold mb-1">Record payment</h3>
      <p className="text-small text-ink-muted mb-5">
        Balance due: {formatMoney(balanceDue, currency)}
      </p>

      <form action={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Amount (${currency})`} htmlFor="amount">
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={balanceDue > 0 ? balanceDue : ""}
              className={inputClasses}
            />
          </Field>
          <Field label="Date received" htmlFor="paid_at">
            <input
              id="paid_at"
              name="paid_at"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Method" htmlFor="method">
            <input
              id="method"
              name="method"
              placeholder="Bank transfer"
              className={inputClasses}
            />
          </Field>
          <Field label="Reference" htmlFor="reference">
            <input id="reference" name="reference" className={inputClasses} />
          </Field>
        </div>

        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={pending} className={buttonStyles.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Save payment
          </button>
          <button type="button" onClick={() => setOpen(false)} className={buttonStyles.secondary}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
