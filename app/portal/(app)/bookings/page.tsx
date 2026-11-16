import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { Card, PageHeader } from "@/components/dashboard/ui";
import BookingsView from "@/components/whatsapp/BookingsView";
import { portalSetBookingSource } from "@/lib/portal/bookings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

/** The bookings of the business chosen in the sidebar: website + WhatsApp. */
export default async function PortalBookingsPage() {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings")) redirect("/portal");
  const { active } = await activeProject(ctx);

  const [{ data: sources }, { data: accounts }] = active
    ? await Promise.all([
        db.from("project_booking_sources").select("project_id").eq("project_id", active.id).limit(1),
        db.from("wa_accounts").select("id").eq("project_id", active.id).limit(1),
      ])
    : [{ data: [] }, { data: [] }];

  if (!active || (!(sources ?? []).length && !(accounts ?? []).length)) {
    return (
      <>
        <PageHeader title="Bookings" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">
            Bookings aren&apos;t connected yet{active ? ` for ${active.name}` : ""} — I&apos;ll set this up for you.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <h1 className="sr-only">Bookings</h1>
      <BookingsView
        projectId={active.id}
        detailBase={`/portal/bookings/${active.id}`}
        chatBase="/portal/whatsapp?chat="
        setSource={portalSetBookingSource}
      />
    </>
  );
}
