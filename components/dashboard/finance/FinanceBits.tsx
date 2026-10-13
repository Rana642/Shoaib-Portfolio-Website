import Link from "next/link";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { Card } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { addMonths, formatPkr, monthPeriod, shortMonth } from "@/lib/finance";

/** A headline number. `tone` colours only the small note, never the figure. */
export function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <Card className="p-5">
      <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">{label}</p>
      <p className="text-h3 font-semibold mt-2 whitespace-nowrap">{formatPkr(value)}</p>
      {note && (
        <p className={cn("text-tag mt-1.5", tone === "good" ? "text-forest" : tone === "bad" ? "text-red-700" : "text-ink-subtle")}>{note}</p>
      )}
    </Card>
  );
}

/** ‹ October 2026 › — links that keep the page's other filters. */
export function MonthNav({ month, href }: { month: string; href: (month: string) => string }) {
  const prev = addMonths(`${month}-01`, -1).slice(0, 7);
  const next = addMonths(`${month}-01`, 1).slice(0, 7);
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-white">
      <Link href={href(prev)} aria-label="Previous month" className="p-2 text-ink-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <span className="px-2 text-small font-medium min-w-[9rem] text-center">{monthPeriod(month).label}</span>
      <Link href={href(next)} aria-label="Next month" className="p-2 text-ink-muted hover:text-ink">
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

/** Shown until the Finance SQL block has been run once. */
export function FinanceSetupNotice() {
  return (
    <Card className="p-5 mb-6 border-citrus/60">
      <p className="text-small font-medium flex items-center gap-2">
        <Database className="size-4" aria-hidden />
        One step left: set up the Finance tables
      </p>
      <p className="text-small text-ink-muted mt-1.5">
        Run the &ldquo;Finance: expenses, other income, monthly bills&rdquo; block from <code>supabase/dashboard-schema.sql</code> once in
        Supabase → SQL Editor. Until then only invoice payments show here.
      </p>
    </Card>
  );
}

/**
 * Money in vs money out per month, with profit as a dot — plain SVG, no
 * chart library. In = Forest, out = Ink (light), profit = Cobalt.
 */
export function MoneyChart({ data }: { data: { month: string; moneyIn: number; moneyOut: number; profit: number }[] }) {
  const W = 960,
    H = 260,
    top = 16,
    bottom = 32,
    left = 8;
  const max = Math.max(1, ...data.flatMap((d) => [d.moneyIn, d.moneyOut, Math.abs(d.profit)]));
  const min = Math.min(0, ...data.map((d) => d.profit));
  const span = max - min;
  const y = (v: number) => top + ((max - v) / span) * (H - top - bottom);
  const slot = (W - left) / Math.max(1, data.length);
  const bar = Math.min(26, slot / 3.2);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Money in and money out by month">
        <line x1={left} x2={W} y1={y(0)} y2={y(0)} className="stroke-ink/15" />
        {data.map((d, i) => {
          const cx = left + slot * i + slot / 2;
          return (
            <g key={d.month}>
              <title>{`${shortMonth(d.month)} — in ${formatPkr(d.moneyIn)}, out ${formatPkr(d.moneyOut)}, profit ${formatPkr(d.profit)}`}</title>
              <rect x={cx - bar - 1} y={y(d.moneyIn)} width={bar} height={Math.max(0, y(0) - y(d.moneyIn))} rx={3} className="fill-forest" />
              <rect x={cx + 1} y={y(d.moneyOut)} width={bar} height={Math.max(0, y(0) - y(d.moneyOut))} rx={3} className="fill-ink/20" />
              {(d.moneyIn > 0 || d.moneyOut > 0) && <circle cx={cx} cy={y(d.profit)} r={4.5} className="fill-cobalt stroke-white" strokeWidth={2} />}
              <text x={cx} y={H - 10} textAnchor="middle" className="fill-ink-subtle" fontSize={13}>
                {shortMonth(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-5 text-tag text-ink-muted mt-3">
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-forest" aria-hidden /> Money in
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-ink/20" aria-hidden /> Money out
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-cobalt" aria-hidden /> Profit
        </span>
      </figcaption>
    </figure>
  );
}

/** Horizontal bars for spending by category. */
export function CategoryBars({ items }: { items: { label: string; pkr: number; note?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.pkr));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-4 text-small">
            <span>
              {i.label}
              {i.note && <span className="text-tag text-ink-subtle"> · {i.note}</span>}
            </span>
            <span className="font-medium whitespace-nowrap">{formatPkr(i.pkr)}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-ink/5">
            <div className="h-full rounded-full bg-citrus" style={{ width: `${Math.max(2, (i.pkr / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
