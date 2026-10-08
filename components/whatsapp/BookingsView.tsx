import { Card } from "@/components/dashboard/ui";
import { CONFIRMED_STATUSES as CONFIRMED, LOST_STATUSES as LOST, projectBookings } from "@/lib/hotel-bookings";
import BookingsTable from "./BookingsTable";

const money = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/**
 * One business's bookings for the last 60 days — the hotel website's own
 * bookings (read live) + bookings marked from WhatsApp — laid out like the
 * hotel admins (status tabs, search, table), with a small summary on top.
 * The caller has already checked the viewer may see this project.
 */
export default async function BookingsView({
  projectId,
  detailBase,
  chatBase,
  setSource,
}: {
  projectId: string;
  detailBase: string;
  chatBase: string;
  setSource?: (projectId: string, bookingRef: string, source: string) => Promise<{ error?: string; ok?: boolean } | undefined>;
}) {
  const { rows, connected, error } = await projectBookings(projectId);
  const confirmed = rows.filter((r) => CONFIRMED.has(r.status));
  const pending = rows.filter((r) => !CONFIRMED.has(r.status) && !LOST.has(r.status));
  const lost = rows.filter((r) => LOST.has(r.status));
  const value = confirmed.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="space-y-5">
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

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-small text-ink-muted">
        <span>
          <strong className="text-ink">{confirmed.length}</strong> confirmed · {money(value)}
        </span>
        <span>
          <strong className="text-ink">{pending.length}</strong> waiting for confirmation
        </span>
        <span>
          <strong className="text-ink">{lost.length}</strong> cancelled / no-show
        </span>
        <span className="text-ink-subtle">Last 60 days</span>
      </div>

      <BookingsTable rows={rows} projectId={projectId} detailBase={detailBase} chatBase={chatBase} setSource={setSource} />
    </div>
  );
}
