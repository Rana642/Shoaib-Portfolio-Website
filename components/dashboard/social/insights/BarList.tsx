import { formatNumber } from "@/lib/dashboard/format";
import { SERIES_COLOR } from "./chart-tokens";

/** Horizontal bars for a short list of nominal categories (reaction types,
 *  interaction types) — one series, so one colour for every bar; the value
 *  rides at each bar's tip, so nothing here is hover-only. */
export default function BarList({
  items,
  emptyText = "No data for this period.",
}: {
  items: { label: string; value: number }[];
  emptyText?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max === 0) return <p className="text-small text-ink-subtle">{emptyText}</p>;

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.label}
          className="group grid grid-cols-[6.5rem_1fr] items-center gap-3"
          title={`${item.label}: ${formatNumber(item.value)}`}
        >
          <span className="text-small text-ink-muted truncate">{item.label}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-3 shrink-0 rounded-r-[4px] transition-opacity group-hover:opacity-75"
              style={{ width: `${Math.max(1.5, (item.value / max) * 82)}%`, backgroundColor: SERIES_COLOR }}
            />
            <span className="text-small tabular-nums text-ink">{formatNumber(item.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
