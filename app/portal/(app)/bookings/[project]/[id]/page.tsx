import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { getHotelBooking } from "@/lib/hotel-bookings";
import BookingDetailView from "@/components/whatsapp/BookingDetailView";
import { portalSaveBookingNotes, portalSetBookingStatus } from "@/lib/portal/bookings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

export default async function PortalBookingPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params;
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings") || !canSeeProject(ctx, project)) redirect("/portal");
  const { data: p } = await db.from("client_projects").select("name, client_id").eq("id", project).maybeSingle();
  if (!p || p.client_id !== ctx.clientId) notFound();
  const b = await getHotelBooking(project, id);
  if (!b) notFound();
  return (
    <BookingDetailView
      b={b}
      hotel={p.name}
      backHref={`/portal/bookings?project=${project}`}
      onStatus={portalSetBookingStatus.bind(null, project, id)}
      onNotes={portalSaveBookingNotes.bind(null, project, id)}
    />
  );
}
