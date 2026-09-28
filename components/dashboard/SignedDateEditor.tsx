"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Pencil } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/dashboard/format";

/**
 * "Accepted and signed by … on <day>" under a document Shoaib confirmed
 * offline, with a way to correct that day afterwards (e.g. the client
 * agreed on a call last week).
 */
export default function SignedDateEditor({
  prefix,
  signer,
  day,
  action,
}: {
  /** e.g. "Accepted and signed by" */
  prefix: string;
  signer: string;
  /** YYYY-MM-DD, in Pakistan time */
  day: string;
  action: (date: string) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(day);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(date);
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  };

  return (
    <div className="text-small text-ink-muted">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span>
            {prefix} <span className="font-medium text-ink">{signer}</span> on
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClasses} !w-44 !py-1.5`}
            aria-label="Date"
          />
          <button type="button" onClick={save} disabled={pending || !date} className={buttonStyles.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDate(day);
              setError(null);
            }}
            className={buttonStyles.secondary}
          >
            Cancel
          </button>
        </div>
      ) : (
        <p>
          {prefix} <span className="font-medium text-ink">{signer}</span> on {formatDate(day)}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 ml-2 text-ink-subtle hover:text-ink underline-offset-4 hover:underline cursor-pointer print:hidden"
          >
            <Pencil className="size-3.5" aria-hidden />
            Change date
          </button>
        </p>
      )}
      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-3 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
