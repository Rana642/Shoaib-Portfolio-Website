import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { Card, PageHeader } from "@/components/dashboard/ui";
import BookingsView from "@/components/whatsapp/BookingsView";
import HotelSectionNav from "@/components/whatsapp/HotelSectionNav";
import { portalSetBookingSource } from "@/lib/portal/bookings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

/** The client's bookings: website + WhatsApp, one business at a time. */
export default async function PortalBookingsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings")) redirect("/portal");
  const { project } = await searchParams;

  const { data: projectRows } = await db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order");
  const visible = (projectRows ?? []).filter((p) => canSeeProject(ctx, p.id as string));
  const ids = visible.map((p) => p.id as string);
  const [{ data: sources }, { data: accounts }] = ids.length
    ? await Promise.all([
        db.from("project_booking_sources").select("project_id").in("project_id", ids),
        db.from("wa_accounts").select("project_id").in("project_id", ids),
      ])
    : [{ data: [] }, { data: [] }];
  const withBookings = visible.filter(
    (p) => (sources ?? []).some((s) => s.project_id === p.id) || (accounts ?? []).some((a) => a.project_id === p.id)
  );

  if (withBookings.length === 0) {
    return (
      <>
        <PageHeader title="Bookings" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">Bookings aren&apos;t connected yet — I&apos;ll set this up for you.</p>
        </Card>
      </>
    );
  }
  const selected = withBookings.find((p) => p.id === project) ?? withBookings[0];

  return (
    <>
      <PageHeader title="Bookings" description="Every website and WhatsApp booking, and which ad each came from." />
      <HotelSectionNav
        base="/portal/bookings"
        projects={withBookings.map((p) => ({ id: p.id as string, name: p.name as string }))}
        projectId={selected.id as string}
      />
      <BookingsView
        projectId={selected.id as string}
        detailBase={`/portal/bookings/${selected.id}`}
        chatBase={`/portal/whatsapp?project=${selected.id}&chat=`}
        setSource={portalSetBookingSource}
      />
    </>
  );
}
