"use client";

import { useState } from "react";

/**
 * Messages per day, stacked: received (cobalt, at the baseline) and sent
 * (forest, on top). Palette validated with the dataviz checker (CVD ΔE 25).
 * Hover any day for its numbers; a table view sits underneath.
 */
type Day = { day: string; in: number; out: number };

const RECEIVED = "#2196F3"; // cobalt
const SENT = "#3FA343"; // forest

const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function MessagesChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.in + d.out));
  const H = 160;

  return (
    <div>
      <div className="flex items-center gap-4 text-tag text-ink-muted mb-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: RECEIVED }} aria-hidden /> Received
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SENT }} aria-hidden /> Sent
        </span>
        <span className="ml-auto tabular-nums">max {max}/day</span>
      </div>

      <div className="relative" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {/* recessive grid: baseline + half line */}
        <div className="absolute inset-x-0 bottom-0 border-t border-ink/15" aria-hidden />
        <div className="absolute inset-x-0 border-t border-dashed border-ink/10" style={{ bottom: H / 2 }} aria-hidden />
        <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label="Messages per day, received and sent">
          {days.map((d, i) => {
            const inH = (d.in / max) * (H - 8);
            const outH = (d.out / max) * (H - 8);
            return (
              <div
                key={d.day}
                className="relative flex-1 h-full flex flex-col justify-end items-stretch cursor-default"
                onMouseEnter={() => setHover(i)}
              >
                {hover === i && <div className="absolute inset-0 bg-ink/[0.04] rounded" aria-hidden />}
                {d.out > 0 && <div style={{ height: outH, background: SENT }} className="rounded-t-[4px] mb-[2px] relative" />}
                {d.in > 0 && (
                  <div style={{ height: inH, background: RECEIVED }} className={`relative ${d.out > 0 ? "" : "rounded-t-[4px]"}`} />
                )}
              </div>
            );
          })}
        </div>
        {hover !== null && days[hover] && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-tag shadow-md whitespace-nowrap"
            style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
          >
            <p className="font-medium text-ink">{label(days[hover].day)}</p>
            <p className="text-ink-muted tabular-nums">
              Received {days[hover].in} · Sent {days[hover].out}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-between text-tag text-ink-subtle mt-1.5 tabular-nums">
        <span>{days[0] && label(days[0].day)}</span>
        <span>{days.length > 2 && label(days[Math.floor(days.length / 2)].day)}</span>
        <span>{days.length > 1 && label(days[days.length - 1].day)}</span>
      </div>

      <details className="mt-3 text-small">
        <summary className="cursor-pointer text-ink-muted">Show as table</summary>
        <table className="mt-2 w-full max-w-sm text-tag tabular-nums">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="font-normal py-1">Day</th>
              <th className="font-normal py-1 text-right">Received</th>
              <th className="font-normal py-1 text-right">Sent</th>
            </tr>
          </thead>
          <tbody>
            {days
              .filter((d) => d.in || d.out)
              .map((d) => (
                <tr key={d.day} className="border-t border-ink/5">
                  <td className="py-1">{label(d.day)}</td>
                  <td className="py-1 text-right">{d.in}</td>
                  <td className="py-1 text-right">{d.out}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
