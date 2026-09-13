"use client";

import { useEffect, useRef, useState } from "react";
import { formatCompact, formatNumber } from "@/lib/dashboard/format";
import type { TrendPoint } from "@/lib/social-insights-shared";
import { SERIES_COLOR, GRID_COLOR, AXIS_COLOR } from "./chart-tokens";

const HEIGHT = 200;
const PAD = { top: 18, right: 48, bottom: 26, left: 44 };

function niceStep(range: number, targetTicks = 3): number {
  const raw = range / targetTicks || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Single-series line + soft area, with a snapping crosshair/tooltip (mouse
 *  and arrow keys) and a table-view twin so no value is hover-only. */
export default function TrendChart({
  title,
  description,
  points,
  zeroBaseline = true,
}: {
  title: string;
  description?: string;
  points: TrendPoint[];
  /** Counts start at 0; a running total like followers reads better
   *  zoomed to its own min–max, or growth looks flat. */
  zeroBaseline?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasData = points.length > 0;
  const values = points.map((p) => p.value);
  const rawMin = hasData ? Math.min(...values) : 0;
  const rawMax = hasData ? Math.max(...values) : 0;
  const lo = zeroBaseline ? 0 : rawMin;
  const hi = rawMax > lo ? rawMax : lo + 1;
  const step = niceStep(hi - lo);
  const yMin = zeroBaseline ? 0 : Math.floor(lo / step) * step;
  const yMax = Math.max(Math.ceil(hi / step) * step, yMin + step);
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + step / 2; t += step) ticks.push(t);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const baseY = PAD.top + plotH;
  const x = (i: number) => PAD.left + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = hasData
    ? `${line} L${x(points.length - 1).toFixed(1)},${baseY} L${x(0).toFixed(1)},${baseY} Z`
    : "";
  const last = points.length - 1;
  const xLabelIdx = points.length > 2 ? [0, Math.floor(last / 2), last] : points.map((_, i) => i);

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const i = points.length <= 1 ? 0 : Math.round(((e.clientX - rect.left - PAD.left) / plotW) * last);
    setActive(Math.min(last, Math.max(0, i)));
  };

  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!hasData) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => Math.max(0, (a ?? last) - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setActive((a) => Math.min(last, (a ?? -1) + 1));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const tipW = 132;
  const activePoint = active != null ? points[active] : null;
  const tipLeft = active != null ? Math.min(width - tipW, Math.max(0, x(active) - tipW / 2)) : 0;
  const tipTop = activePoint ? Math.max(0, y(activePoint.value) - 58) : 0;

  return (
    <div className="bg-white border border-ink/10 rounded-xl p-5">
      <p className="text-small font-semibold">{title}</p>
      {description && <p className="text-tag text-ink-subtle mt-0.5">{description}</p>}

      <div ref={wrapRef} className="relative mt-3">
        {hasData ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${title}: ${points.length} days, latest ${formatNumber(points[last].value)}. Use arrow keys to step through days.`}
            tabIndex={0}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-citrus/40 rounded-md"
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(last)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === yMin ? AXIS_COLOR : GRID_COLOR} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                  {formatCompact(t)}
                </text>
              </g>
            ))}
            {xLabelIdx.map((i) => (
              <text
                key={i}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                className="fill-ink-subtle text-[11px]"
              >
                {shortDate(points[i].date)}
              </text>
            ))}

            <path d={area} fill={SERIES_COLOR} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={SERIES_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            <circle cx={x(last)} cy={y(points[last].value)} r={4} fill={SERIES_COLOR} stroke="#ffffff" strokeWidth={2} />
            <text x={x(last) + 8} y={y(points[last].value) + 4} className="fill-ink text-[11px] font-semibold tabular-nums">
              {formatCompact(points[last].value)}
            </text>

            {activePoint && active != null && (
              <g pointerEvents="none">
                <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={baseY} stroke={AXIS_COLOR} strokeWidth={1} />
                <circle cx={x(active)} cy={y(activePoint.value)} r={4} fill={SERIES_COLOR} stroke="#ffffff" strokeWidth={2} />
              </g>
            )}
          </svg>
        ) : (
          <div className="h-[200px] flex items-center justify-center rounded-lg border border-dashed border-ink/15">
            <p className="text-small text-ink-subtle">No data for this period.</p>
          </div>
        )}

        {activePoint && (
          <div
            className="absolute pointer-events-none bg-white border border-ink/10 rounded-lg shadow-sm px-3 py-2"
            style={{ left: tipLeft, top: tipTop, width: tipW }}
          >
            <p className="text-small font-semibold tabular-nums">{formatNumber(activePoint.value)}</p>
            <p className="text-tag text-ink-subtle">{shortDate(activePoint.date)}</p>
          </div>
        )}
      </div>

      {hasData && (
        <details className="mt-3">
          <summary className="text-tag text-ink-subtle cursor-pointer select-none hover:text-ink">Table view</summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-ink/10">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-ink/10 text-ink-subtle">
                  <th className="text-left font-medium px-3 py-1.5">Date</th>
                  <th className="text-right font-medium px-3 py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date} className="border-b border-ink/5 last:border-0">
                    <td className="px-3 py-1.5">{shortDate(p.date)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
