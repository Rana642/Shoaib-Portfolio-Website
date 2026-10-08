import { Card, StatusBadge } from "@/components/dashboard/ui";
import { projectBookings } from "@/lib/hotel-bookings";

const CHANNEL: Record<string, string> = { website: "Website", whatsapp: "WhatsApp", phone: "Phone", walkin: "Walk-in", ota: "OTA" };
const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const day = (d: string | null) =>
  d ? new Date(d.length === 10 ? `${d}T00:00:00+05:00` : d).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" }) : "—";

/**
 * One business's bookings for the last 60 days: the hotel website's own
 * bookings (read live) + bookings marked from WhatsApp, with totals and a
 * by-source summary. Shared by the portal and my dashboard; the caller has
 * already checked the viewer may see this project.
 */
export default async function BookingsView({ projectId }: { projectId: string }) {
  const { rows, connected, error } = await projectBookings(projectId);
  const live = rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const revenue = live.reduce((s, r) => s + (r.amount ?? 0), 0);
  const nights = live.reduce((s, r) => s + (r.nights ?? 0), 0);

  const bySource = new Map<string, number>();
  for (const r of live) {
    const k = r.source ?? (r.channel === "website" ? "Website (no ad code)" : CHANNEL[r.channel] ?? r.channel);
    bySource.set(k, (bySource.get(k) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      {!connected && (
        <Card variant="solid" className="p-5">
          <p className="text-small text-ink-muted">Website bookings aren&apos;t connected yet — showing WhatsApp bookings only.</p>
        </Card>
      )}
      {error && (
        <Card variant="solid" className="p-5">
          <p className="text-small text-red-700">Couldn&apos;t read website bookings right now: {error}</p>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          [String(live.length), "Bookings (60 days)"],
          [String(nights), "Room nights"],
          [money(revenue), "Booking value"],
        ].map(([v, l]) => (
          <Card key={l} className="px-4 py-3">
            <p className="text-h3 font-semibold leading-none tabular-nums">{v}</p>
            <p className="text-tag text-ink-muted mt-2">{l}</p>
          </Card>
        ))}
      </div>

      {bySource.size > 0 && (
        <Card className="p-5">
          <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">Where bookings came from</p>
          <div className="flex flex-wrap gap-2">
            {[...bySource.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <span key={k} className="rounded-lg border border-ink/10 px-3 py-1.5 text-small">
                  <span className="font-mono">{k}</span> · <strong>{n}</strong>
                </span>
              ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-left text-ink-muted border-b border-ink/10">
              <th className="px-4 py-3 font-medium">Booked</th>
              <th className="px-4 py-3 font-medium">Guest</th>
              <th className="px-4 py-3 font-medium">Room</th>
              <th className="px-4 py-3 font-medium">Check-in</th>
              <th className="px-4 py-3 font-medium text-right">Nights</th>
              <th className="px-4 py-3 font-medium text-right">Amount</th>
              <th className="px-4 py-3 font-medium">Via</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-ink-muted">
                  No bookings in the last 60 days.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={`${r.channel}-${r.ref}`} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap">{day(r.created_at)}</td>
                <td className="px-4 py-2.5">{r.guest}</td>
                <td className="px-4 py-2.5">{r.room ?? "—"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{day(r.check_in)}</td>
                <td className="px-4 py-2.5 text-right">{r.nights ?? "—"}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">{r.amount ? money(r.amount) : "—"}</td>
                <td className="px-4 py-2.5">{CHANNEL[r.channel] ?? r.channel}</td>
                <td className="px-4 py-2.5 font-mono text-tag">{r.source ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
