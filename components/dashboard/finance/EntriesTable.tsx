"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Paperclip, Pencil, Trash2 } from "lucide-react";
import { deleteEntry, setPaymentPkr } from "@/lib/dashboard/actions/finance";
import { Card, inputClasses } from "@/components/dashboard/ui";
import { formatDate, formatMoney } from "@/lib/dashboard/format";
import { formatPkr } from "@/lib/finance";
import type { MoneyRow } from "@/lib/dashboard/finance";
import EntryForm from "./EntryForm";

const th = "font-mono uppercase text-tag tracking-widest text-ink-subtle px-5 py-3";

/**
 * Lines of money in / out with edit and delete in place. Invoice payments
 * link to their invoice; one paid in another currency can have its PKR
 * corrected to what actually reached the bank.
 */
export default function EntriesTable({
  rows,
  receiptLinks,
  clients,
  rates,
  showKind = false,
}: {
  rows: MoneyRow[];
  receiptLinks: Record<string, string>;
  clients: { id: string; name: string }[];
  rates: Record<string, number>;
  /** Overview mixes money in and out — show which is which. */
  showKind?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pkrEdit, setPkrEdit] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const remove = (row: MoneyRow) => {
    if (!confirm(`Delete this ${row.kind === "expense" ? "expense" : "income"} of ${formatMoney(row.amount, row.currency)}?`)) return;
    setBusy(row.id);
    startTransition(async () => {
      const res = await deleteEntry(row.id);
      setBusy(null);
      if ("error" in res) setError(res.error ?? "Couldn't delete.");
      else router.refresh();
    });
  };

  const savePkr = () => {
    if (!pkrEdit) return;
    setBusy(pkrEdit.id);
    startTransition(async () => {
      const res = await setPaymentPkr(pkrEdit.id, Number(pkrEdit.value));
      setBusy(null);
      if ("error" in res) setError(res.error ?? "Couldn't save.");
      else {
        setPkrEdit(null);
        router.refresh();
      }
    });
  };

  return (
    <Card className="overflow-hidden">
      {error && <p className="text-small text-red-700 bg-red-500/10 border-b border-red-600/20 px-5 py-3">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-ink/10">
              <th className={th}>Date</th>
              <th className={th}>Details</th>
              <th className={`${th} hidden lg:table-cell`}>Client</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={`${th} text-right`}>PKR</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={`${r.source}-${r.id}`}>
                <tr className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02] align-top">
                  <td className="px-5 py-4 text-small text-ink-muted whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-5 py-4">
                    <p className="text-small font-medium">
                      {showKind && (
                        <span className={r.kind === "income" ? "text-forest" : "text-ink-muted"}>{r.kind === "income" ? "In · " : "Out · "}</span>
                      )}
                      {r.party ?? r.categoryLabel}
                      {r.invoice && (
                        <>
                          {" "}
                          ·{" "}
                          <Link href={`/dashboard/invoices/${r.invoice.id}`} className="underline decoration-citrus decoration-2 underline-offset-4">
                            {r.invoice.number}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="text-tag text-ink-subtle mt-1">
                      {r.categoryLabel}
                      {r.passThrough && " · client money"}
                      {r.description && !r.invoice && ` · ${r.description}`}
                      {r.method && ` · ${r.method}`}
                    </p>
                    {r.clientName && <p className="text-tag text-ink-subtle mt-0.5 lg:hidden">{r.clientName}</p>}
                  </td>
                  <td className="px-5 py-4 text-small hidden lg:table-cell">{r.clientName ?? "—"}</td>
                  <td className="px-5 py-4 text-small text-right whitespace-nowrap">{formatMoney(r.amount, r.currency)}</td>
                  <td className="px-5 py-4 text-small font-medium text-right whitespace-nowrap">
                    {pkrEdit?.id === r.id ? (
                      <span className="inline-flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          autoFocus
                          aria-label="PKR received"
                          value={pkrEdit.value}
                          onChange={(e) => setPkrEdit({ id: r.id, value: e.target.value })}
                          className={`${inputClasses} w-36 py-1.5`}
                        />
                        <button type="button" onClick={savePkr} aria-label="Save PKR" className="cursor-pointer text-forest">
                          {busy === r.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                        </button>
                      </span>
                    ) : (
                      <>
                        <span className={r.kind === "income" ? "" : "text-ink-muted"}>{formatPkr(r.pkr)}</span>
                        {r.currency !== "PKR" && (
                          <span className="block text-tag font-normal text-ink-subtle mt-1">
                            {r.pkrEstimated ? "at that day's rate" : r.fxRate ? `@ ${r.fxRate.toFixed(2)}` : ""}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-3 text-ink-muted">
                      {receiptLinks[r.id] && (
                        <a href={receiptLinks[r.id]} target="_blank" rel="noreferrer" aria-label="Open the receipt" title="Open the receipt" className="hover:text-ink">
                          <Paperclip className="size-4" aria-hidden />
                        </a>
                      )}
                      {r.source === "entry" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(editing === r.id ? null : r.id)}
                            aria-label="Edit"
                            title="Edit"
                            className="hover:text-ink cursor-pointer"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                          <button type="button" onClick={() => remove(r)} aria-label="Delete" title="Delete" className="hover:text-red-700 cursor-pointer">
                            {busy === r.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                          </button>
                        </>
                      ) : (
                        r.currency !== "PKR" &&
                        pkrEdit?.id !== r.id && (
                          <button
                            type="button"
                            onClick={() => setPkrEdit({ id: r.id, value: String(r.pkr) })}
                            aria-label="Correct the PKR received"
                            title="Correct the PKR received"
                            className="hover:text-ink cursor-pointer"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
                {editing === r.id && (
                  <tr className="border-b border-ink/5 bg-white/60">
                    <td colSpan={6} className="px-5 py-6">
                      <EntryForm
                        kind={r.kind}
                        clients={clients}
                        rates={rates}
                        initial={{
                          id: r.id,
                          entry_date: r.date,
                          category: r.category,
                          party: r.party,
                          description: r.description,
                          amount: r.amount,
                          currency: r.currency,
                          pkr_amount: r.pkr,
                          client_id: r.clientId,
                          pass_through: r.passThrough,
                          method: r.method,
                          notes: r.notes,
                          fileName: r.file?.name ?? (r.file ? "Receipt" : null),
                        }}
                        onDone={() => {
                          setEditing(null);
                          router.refresh();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
