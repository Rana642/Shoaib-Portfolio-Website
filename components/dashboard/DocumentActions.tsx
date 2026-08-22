"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Printer, Pencil, LoaderCircle, ArrowRight } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

type StatusOption = { value: string; label: string };

export default function DocumentActions({
  editHref,
  statusOptions,
  currentStatus,
  onStatusChange,
  convertAction,
  convertLabel,
}: {
  editHref: string;
  statusOptions: StatusOption[];
  currentStatus: string;
  onStatusChange: (status: string) => Promise<{ error?: string; ok?: boolean }>;
  convertAction?: () => Promise<{ error?: string } | void>;
  convertLabel?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeStatus = (status: string) => {
    setError(null);
    startTransition(async () => {
      const result = await onStatusChange(status);
      if (result?.error) setError(result.error);
    });
  };

  const convert = () => {
    if (!convertAction) return;
    setError(null);
    startTransition(async () => {
      // A successful convert redirects; anything returned is a failure.
      const result = await convertAction();
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={editHref} className={buttonStyles.secondary}>
          <Pencil className="size-4" aria-hidden />
          Edit
        </Link>

        <button onClick={() => window.print()} className={buttonStyles.secondary}>
          <Printer className="size-4" aria-hidden />
          Print / PDF
        </button>

        <select
          value={currentStatus}
          onChange={(e) => changeStatus(e.target.value)}
          disabled={pending}
          aria-label="Change status"
          className="rounded-lg border border-ink/20 px-4 py-2.5 text-sm font-medium bg-white cursor-pointer focus:outline-none focus:border-citrus"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {convertAction && (
          <button onClick={convert} disabled={pending} className={buttonStyles.primary}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-4" aria-hidden />
            )}
            {convertLabel}
          </button>
        )}
      </div>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
