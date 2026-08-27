"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { updateAgreementClauses } from "@/lib/dashboard/actions/agreements";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { AgreementClause } from "@/lib/dashboard/types";

type EditableClause = AgreementClause & { key: string };

let keySeed = 0;
const nextKey = () => `clause-${keySeed++}`;

export default function AgreementClausesForm({
  agreementId,
  clauses,
}: {
  agreementId: string;
  clauses: AgreementClause[];
}) {
  const [items, setItems] = useState<EditableClause[]>(
    (clauses.length > 0 ? clauses : [{ title: "", body: "", showInvestmentSummary: false }]).map((c) => ({
      ...c,
      key: nextKey(),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateClause = (key: string, patch: Partial<AgreementClause>) =>
    setItems((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addClause = () =>
    setItems((prev) => [...prev, { key: nextKey(), title: "", body: "", showInvestmentSummary: false }]);

  const removeClause = (key: string) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((c) => c.key !== key)));

  const setSummaryAnchor = (key: string, checked: boolean) =>
    setItems((prev) => prev.map((c) => ({ ...c, showInvestmentSummary: checked && c.key === key })));

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateAgreementClauses(
        agreementId,
        items.map(({ title, body, showInvestmentSummary }) => ({ title, body, showInvestmentSummary }))
      );
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {items.map((clause, index) => (
        <Card key={clause.key} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle pt-2.5">
              Clause {index + 1}
            </span>
            <button
              type="button"
              onClick={() => removeClause(clause.key)}
              disabled={items.length === 1}
              className="text-ink-subtle hover:text-red-700 transition-colors disabled:opacity-30 disabled:pointer-events-none p-1.5"
              aria-label="Remove clause"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>

          <Field label="Title" htmlFor={`title-${clause.key}`}>
            <input
              id={`title-${clause.key}`}
              value={clause.title}
              onChange={(e) => updateClause(clause.key, { title: e.target.value })}
              className={inputClasses}
            />
          </Field>

          <Field label="Body" htmlFor={`body-${clause.key}`}>
            <textarea
              id={`body-${clause.key}`}
              rows={5}
              value={clause.body}
              onChange={(e) => updateClause(clause.key, { body: e.target.value })}
              className={inputClasses}
            />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!clause.showInvestmentSummary}
              onChange={(e) => setSummaryAnchor(clause.key, e.target.checked)}
              className="size-4 accent-citrus cursor-pointer"
            />
            <span className="text-small">Show the Investment Summary right after this clause</span>
          </label>
        </Card>
      ))}

      <button type="button" onClick={addClause} className={buttonStyles.secondary}>
        <Plus className="size-4" aria-hidden />
        Add clause
      </button>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onSubmit} disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Save changes
        </button>
        <Link href={`/dashboard/agreements/${agreementId}`} className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
