"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { inputClasses } from "@/components/dashboard/ui";
import { SourcePicker } from "@/components/dashboard/WhatsAppChat";
import { MANUAL_SOURCES } from "@/lib/booking-source-options";
import { BOOKING_STATUSES, statusLook } from "@/lib/booking-status";
import type { BookingRow } from "@/lib/hotel-bookings";

type Result = { error?: string; ok?: boolean } | undefined;

const CHANNEL: Record<string, string> = { website: "Website", whatsapp: "WhatsApp", phone: "Phone", walkin: "Walk-in", ota: "OTA" };
const money = (n: number | null) => (n ? `Rs ${Math.round(n).toLocaleString("en-PK")}` : "—");
const day = (d?: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00+05:00` : d).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" }) : "—";

const CHIP: [RegExp, string][] = [
  [/^facebook ads|^meta/i, "bg-cobalt/10 text-ink border-cobalt/25"],
  [/^google ads|^google \(/i, "bg-forest/10 text-ink border-forest/25"],
  [/^direct|^not tracked/i, "bg-ink/5 text-ink-subtle border-ink/10"],
];

/** The source as a chip (like the hotel admin), with the ad code under it. */
function SourceChip({ source, code }: { source: string | null; code?: string | null }) {
  if (!source) return <span className="text-ink-subtle">—</span>;
  const cls = CHIP.find(([re]) => re.test(source))?.[1] ?? "bg-ink/5 text-ink-muted border-ink/10";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`rounded border px-2 py-0.5 text-tag whitespace-nowrap ${cls}`}>{source}</span>
      {code && <span className="font-mono text-[10px] text-ink-subtle max-w-[9rem] truncate" title={code}>{code}</span>}
    </span>
  );
}

/** The hotel-admin-style bookings list: status tabs, search, one row per booking. */
export default function BookingsTable({
  rows,
  projectId,
  detailBase,
  chatBase,
  setSource,
  switcher,
}: {
  rows: BookingRow[];
  projectId: string;
  /** e.g. "/portal/bookings/<project>" — a row links to `${detailBase}/${id}` */
  detailBase: string;
  /** Where a WhatsApp booking's chat opens, e.g. "/portal/whatsapp?project=…&chat=" */
  chatBase: string;
  setSource?: (projectId: string, bookingRef: string, source: string) => Promise<Result>;
  /** The hotel switcher, shown after the search box. */
  switcher?: React.ReactNode;
}) {
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!query) return true;
      return [r.guest, r.phone ?? "", r.ref, r.room ?? "", r.source ?? ""].some((v) => v.toLowerCase().includes(query));
    });
  }, [rows, status, q]);

  const href = (r: BookingRow) => (r.id ? `${detailBase}/${r.id}` : r.chatId ? `${chatBase}${r.chatId}` : null);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap gap-2">
          {[{ key: "all", label: "All" }, ...BOOKING_STATUSES].map((f) => {
            const n = f.key === "all" ? rows.length : (counts.get(f.key) ?? 0);
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatus(f.key)}
                className={`rounded-full border px-3 py-1.5 text-small transition ${
                  status === f.key ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:border-ink/40"
                }`}
              >
                {f.label}
                {n > 0 && <span className="ml-1.5 opacity-60">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, ref…"
              aria-label="Search bookings"
              className={`${inputClasses} !pl-9 sm:!w-60`}
            />
          </label>
          {switcher}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-ink/10 bg-white/60 p-6 text-center text-small text-ink-muted">No bookings match.</p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {shown.map((r) => {
              const link = href(r);
              const look = statusLook(r.status);
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.guest}</span>
                    <span className={`rounded-full px-2 py-0.5 text-tag font-semibold ${look.cls}`}>{look.label}</span>
                  </div>
                  <p className="text-small text-ink-muted mt-1">{r.room ?? "—"}</p>
                  <p className="text-tag text-ink-subtle">
                    {day(r.check_in)} → {day(r.check_out)} · {r.phone ?? ""}
                  </p>
                  <p className="text-tag mt-1">
                    <span className="font-mono">{r.ref}</span> · {money(r.amount)} {r.source && <span>· {r.source}</span>}
                  </p>
                </>
              );
              return link ? (
                <Link key={`${r.channel}-${r.ref}`} href={link} className="block rounded-xl border border-ink/10 bg-white/70 p-4">
                  {body}
                </Link>
              ) : (
                <div key={`${r.channel}-${r.ref}`} className="rounded-xl border border-ink/10 bg-white/70 p-4">
                  {body}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-ink/10 bg-white/70">
            <table className="w-full text-small">
              <thead>
                <tr className="text-left text-tag uppercase tracking-wide text-ink-muted border-b border-ink/10">
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Room</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const link = href(r);
                  const look = statusLook(r.status);
                  return (
                    <tr key={`${r.channel}-${r.ref}`} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {link ? (
                          <Link href={link} className="font-semibold font-mono underline-offset-4 hover:underline">
                            {r.ref}
                          </Link>
                        ) : (
                          <span className="font-mono">{r.ref}</span>
                        )}
                        <span className="block text-tag text-ink-subtle">{CHANNEL[r.channel] ?? r.channel}</span>
                      </td>
                      <td className="px-4 py-3 min-w-[8rem]">{r.guest}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{r.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-muted">{r.room ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">
                        {day(r.check_in)} → {day(r.check_out)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{money(r.amount)}</td>
                      <td className="px-4 py-3">
                        {setSource && (r.channel === "phone" || r.channel === "walkin") && (r.sourceSet || !r.source || r.source === "Direct" || r.source === "Not tracked") ? (
                          <SourcePicker value={r.sourceSet ? r.source : null} options={MANUAL_SOURCES} onChange={(v) => setSource(projectId, r.ref, v)} />
                        ) : (
                          <SourceChip source={r.source} code={r.code} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-tag font-semibold whitespace-nowrap ${look.cls}`}>{look.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
