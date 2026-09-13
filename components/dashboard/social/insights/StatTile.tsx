import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCompact } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

/** label · value · delta-vs-previous-period (or a plain note). Every metric
 *  on this dashboard is "up is good", so direction alone picks the colour —
 *  always paired with an arrow icon, never colour on its own. */
export default function StatTile({
  label,
  value,
  previous,
  comparisonLabel,
  note,
}: {
  label: string;
  value: number | null;
  previous?: number | null;
  comparisonLabel?: string;
  note?: string;
}) {
  const delta = value != null && previous != null && previous > 0 ? (value - previous) / previous : null;
  const up = delta != null && delta > 0.0005;
  const down = delta != null && delta < -0.0005;
  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <div className="bg-white border border-ink/10 rounded-xl p-5">
      <p className="text-small text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold mt-2 leading-none">{formatCompact(value)}</p>
      {delta != null ? (
        <p
          className={cn(
            "mt-2.5 text-tag inline-flex flex-wrap items-center gap-1",
            up ? "text-green-700" : down ? "text-red-700" : "text-ink-subtle"
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="font-medium tabular-nums">
            {delta > 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%
          </span>
          {comparisonLabel && <span className="text-ink-subtle">{comparisonLabel}</span>}
        </p>
      ) : note ? (
        <p className="mt-2.5 text-tag text-ink-subtle">{note}</p>
      ) : null}
    </div>
  );
}
