"use client";

import { inputClasses } from "@/components/dashboard/ui";

/** "− 16 +" control for countable lines (posts, reels, ...). */
export default function CountStepper({
  label,
  count,
  onChange,
  showLabel,
  perMonth,
  note,
}: {
  label: string;
  count: number;
  onChange: (count: number) => void;
  /** Only the first row of a list shows column labels. */
  showLabel: boolean;
  perMonth?: boolean;
  note?: string;
}) {
  const title = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div>
      {showLabel && (
        <label className="block text-small font-medium mb-1.5">
          {title}
          {perMonth ? " per month" : ""}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, count - 1))}
          aria-label={`Fewer ${label}`}
          className="size-10 shrink-0 rounded-lg border border-ink/15 text-body hover:bg-ink/5"
        >
          −
        </button>
        <input
          type="number"
          min="1"
          value={count}
          onChange={(e) => onChange(Number(e.target.value) || 1)}
          className={`${inputClasses} text-center`}
          aria-label={`Number of ${label}`}
        />
        <button
          type="button"
          onClick={() => onChange(count + 1)}
          aria-label={`More ${label}`}
          className="size-10 shrink-0 rounded-lg border border-ink/15 text-body hover:bg-ink/5"
        >
          +
        </button>
      </div>
      {note && <p className="text-tag text-ink-muted mt-1.5">{note}</p>}
    </div>
  );
}
