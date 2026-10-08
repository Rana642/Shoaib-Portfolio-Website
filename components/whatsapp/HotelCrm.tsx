"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightCircle, Download, MessageCircle, Phone, Search } from "lucide-react";
import { inputClasses } from "@/components/dashboard/ui";
import type { Contact, Inquiry } from "@/lib/hotel-crm";

type Result = { error?: string; ok?: boolean } | undefined;

const STATUS_CLS: Record<string, string> = {
  new: "bg-cobalt/15 text-ink",
  contacted: "bg-citrus/25 text-ink",
  converted: "bg-green-500/15 text-green-800",
  closed: "bg-ink/10 text-ink-muted",
  spam: "bg-red-500/10 text-red-700",
};
const wa = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "").replace(/^0/, "92")}`;
const when = (d: string) =>
  new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (d: string | null) =>
  d ? new Date(`${d}T00:00:00+05:00`).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" }) : null;

function Filters({
  tabs,
  active,
  onTab,
  q,
  onQ,
  counts,
}: {
  tabs: string[];
  active: string;
  onTab: (t: string) => void;
  q: string;
  onQ: (v: string) => void;
  counts?: Map<string, number>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className={`rounded-full border px-3 py-1.5 text-small capitalize transition ${active === t ? "border-ink bg-ink text-cloud" : "border-ink/15 hover:border-ink/40"}`}
          >
            {t}
            {counts && (counts.get(t) ?? 0) > 0 && <span className="ml-1.5 opacity-60">{counts.get(t)}</span>}
          </button>
        ))}
      </div>
      <label className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <input value={q} onChange={(e) => onQ(e.target.value)} placeholder="Search name, phone…" aria-label="Search" className={`${inputClasses} !pl-9 sm:!w-64`} />
      </label>
    </div>
  );
}

/** The hotel admins' Inquiries list: status tabs, search, call / WhatsApp / Convert, status buttons. */
export function InquiriesList({
  rows,
  statuses,
  convertUrls,
  onStatus,
}: {
  rows: Inquiry[];
  statuses: string[];
  /** inquiry id → the hotel admin's prefilled New Booking form */
  convertUrls: Record<string, string>;
  onStatus: (id: string, status: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const m = new Map<string, number>([["all", rows.length]]);
    for (const r of rows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (tab === "all" || r.status === tab) && (!s || [r.name, r.phone ?? "", r.email ?? ""].some((v) => v.toLowerCase().includes(s))));
  }, [rows, tab, q]);

  return (
    <div>
      <Filters tabs={["all", ...statuses]} active={tab} onTab={setTab} q={q} onQ={setQ} counts={counts} />
      {error && <p className="text-small text-red-700 mb-3">{error}</p>}
      {shown.length === 0 ? (
        <p className="rounded-xl border border-ink/10 bg-white/60 p-6 text-center text-small text-ink-muted">No inquiries match.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className="rounded-xl border border-ink/10 bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-tag font-semibold capitalize ${STATUS_CLS[r.status] ?? STATUS_CLS.new}`}>{r.status}</span>
                    {r.channel && <span className="text-tag text-ink-subtle">via {r.channel.replace(/_/g, " ")}</span>}
                    {r.intent && <span className="text-tag text-ink-subtle">· {r.intent}</span>}
                    {r.source && <span className="font-mono text-tag rounded bg-citrus/20 px-1.5">{r.source}</span>}
                  </div>
                  <p className="text-small text-ink-muted mt-0.5">
                    {r.phone ?? "—"}
                    {r.email ? ` · ${r.email}` : ""}
                  </p>
                  {(r.room || r.check_in) && (
                    <p className="text-tag text-ink-subtle">
                      {r.room ?? ""} {r.check_in ? `${r.room ? "· " : ""}${day(r.check_in)}${r.check_out ? ` → ${day(r.check_out)}` : ""}` : ""}
                    </p>
                  )}
                  {r.message && <p className="mt-2 max-w-xl whitespace-pre-wrap text-small">{r.message}</p>}
                  {r.notes && <p className="mt-1 text-tag italic text-ink-muted">“{r.notes}”</p>}
                  <p className="mt-1 text-tag text-ink-subtle">{when(r.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.phone && (
                    <>
                      <a href={`tel:${r.phone}`} className="rounded-lg border border-ink/20 p-2 hover:bg-ink/5" aria-label="Call">
                        <Phone className="size-4" aria-hidden />
                      </a>
                      <a href={wa(r.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] p-2 text-white hover:brightness-95" aria-label="WhatsApp">
                        <MessageCircle className="size-4" aria-hidden />
                      </a>
                    </>
                  )}
                  {r.status !== "converted" && convertUrls[r.id] && (
                    <a
                      href={convertUrls[r.id]}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Opens the hotel's booking form, filled in — the inquiry becomes Converted once the booking is saved"
                      className="flex items-center gap-1 rounded-lg bg-citrus px-2.5 py-2 text-tag font-semibold text-ink hover:brightness-95"
                    >
                      <ArrowRightCircle className="size-4" aria-hidden /> Convert
                    </a>
                  )}
                </div>
              </div>
              {r.status !== "converted" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {statuses
                    .filter((s) => s !== "converted")
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={pending || r.status === s}
                        onClick={() =>
                          start(async () => {
                            setError(null);
                            const res = await onStatus(r.id, s);
                            if (res?.error) setError(res.error);
                            else router.refresh();
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-tag capitalize transition disabled:opacity-50 ${r.status === s ? STATUS_CLS[s] : "bg-ink/5 text-ink-muted hover:bg-ink/10"}`}
                      >
                        {s}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every guest who booked or inquired, merged by phone — with CSV export. */
export function ContactsList({ rows, fileName }: { rows: Contact[]; fileName: string }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(
      (c) =>
        (tab === "all" || (tab === "guests" ? c.bookings > 0 : c.bookings === 0)) &&
        (!s || [c.name, c.phone ?? "", c.email ?? ""].some((v) => v.toLowerCase().includes(s)))
    );
  }, [rows, tab, q]);

  const exportCsv = () => {
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Name", "Phone", "Email", "Bookings", "Inquiries", "Last stay", "Total spent (Rs)", "Last activity"].join(","),
      ...shown.map((c) => [c.name, c.phone, c.email, c.bookings, c.inquiries, c.lastStay, Math.round(c.totalSpent), c.lastActivity.slice(0, 10)].map(esc).join(",")),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${fileName}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Filters tabs={["all", "guests", "leads only"]} active={tab} onTab={setTab} q={q} onQ={setQ} />
      <div className="flex justify-between items-center mb-3 text-small text-ink-muted">
        <span>{shown.length} contacts</span>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 underline underline-offset-4">
          <Download className="size-4" aria-hidden /> Export CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-white/70">
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-tag uppercase tracking-wide text-ink-muted border-b border-ink/10">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium text-right">Bookings</th>
              <th className="px-4 py-3 font-medium text-right">Inquiries</th>
              <th className="px-4 py-3 font-medium">Last stay</th>
              <th className="px-4 py-3 font-medium text-right">Spent</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.key} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]">
                <td className="px-4 py-2.5">{c.name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-muted">{c.phone ?? "—"}</td>
                <td className="px-4 py-2.5 text-ink-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">{c.bookings}</td>
                <td className="px-4 py-2.5 text-right">{c.inquiries}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{day(c.lastStay) ?? "—"}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{c.totalSpent ? `Rs ${Math.round(c.totalSpent).toLocaleString("en-PK")}` : "—"}</td>
                <td className="px-4 py-2.5">
                  {c.phone && (
                    <span className="flex gap-1.5">
                      <a href={`tel:${c.phone}`} className="rounded-lg border border-ink/20 p-1.5 hover:bg-ink/5" aria-label="Call">
                        <Phone className="size-3.5" aria-hidden />
                      </a>
                      <a href={wa(c.phone)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] p-1.5 text-white" aria-label="WhatsApp">
                        <MessageCircle className="size-3.5" aria-hidden />
                      </a>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
