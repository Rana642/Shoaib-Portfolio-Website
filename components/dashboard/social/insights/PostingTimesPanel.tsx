import { formatNumber } from "@/lib/dashboard/format";
import { SERIES_COLOR } from "./chart-tokens";
import type { PostingTimeAnalysis, TimeBucket } from "@/lib/social-insights";

function Bars({ buckets }: { buckets: TimeBucket[] }) {
  const max = Math.max(0, ...buckets.map((b) => b.medianReach));
  return (
    <ul className="space-y-2.5">
      {buckets.map((b) => (
        <li key={b.label} className="grid grid-cols-[6.5rem_1fr] items-center gap-3" title={`${b.count} post${b.count === 1 ? "" : "s"}`}>
          <span className="text-small text-ink-muted truncate">{b.label}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="h-3 shrink-0 rounded-r-[4px]"
              style={{ width: max ? `${Math.max(1.5, (b.medianReach / max) * 74)}%` : "1.5%", backgroundColor: SERIES_COLOR }}
            />
            <span className="text-small tabular-nums text-ink">{formatNumber(b.medianReach)}</span>
            <span className="text-tag text-ink-subtle">
              ({b.count} post{b.count === 1 ? "" : "s"})
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Meta retired every "when are your followers online" metric years ago —
 *  this is the honest substitute: average organic reach of THIS account's
 *  own past posts, split by when they went out (Pakistan time). Below a
 *  minimum sample it says so instead of pretending a pattern exists. */
export default function PostingTimesPanel({ analysis }: { analysis: PostingTimeAnalysis }) {
  if (!analysis.reliable) {
    return (
      <div className="bg-white border border-ink/10 rounded-xl p-5">
        <p className="text-small font-semibold">Best posting times</p>
        <p className="text-small text-ink-subtle mt-2">
          Only {analysis.sampleSize} post{analysis.sampleSize === 1 ? "" : "s"} in this period — need at least 8 for a
          pattern that isn&apos;t just noise. Widen the date range or check back once more have gone out.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-ink/10 rounded-xl p-5">
      <p className="text-small font-semibold">
        Best posting times <span className="font-normal text-ink-subtle">· median reach by day/time (PKT)</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div>
          <p className="text-tag text-ink-subtle mb-2">By day of week</p>
          <Bars buckets={analysis.byDayOfWeek} />
        </div>
        <div>
          <p className="text-tag text-ink-subtle mb-2">By time of day</p>
          <Bars buckets={analysis.byHour} />
        </div>
      </div>
      <p className="text-tag text-ink-subtle mt-4">
        From this account&apos;s own {analysis.sampleSize} posts in this period — not a Meta audience metric (those
        were retired). Sparse buckets (few posts) are noisier; use as a lead, not a rule.
      </p>
    </div>
  );
}
