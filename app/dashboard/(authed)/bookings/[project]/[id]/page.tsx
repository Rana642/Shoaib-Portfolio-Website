import { notFound } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { getHotelBooking } from "@/lib/hotel-bookings";
import BookingDetailView from "@/components/whatsapp/BookingDetailView";
import { saveHotelNotesAdmin, setHotelStatusAdmin } from "@/lib/dashboard/actions/booking-overrides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking" };

export default async function DashboardBookingPage({ params }: { params: Promise<{ project: string; id: string }> }) {
  const { project, id } = await params;
  const { data: p } = await db.from("client_projects").select("name").eq("id", project).maybeSingle();
  if (!p) notFound();
  const b = await getHotelBooking(project, id);
  if (!b) notFound();
  return (
    <BookingDetailView
      b={b}
      hotel={p.name}
      backHref={`/dashboard/bookings?project=${project}`}
      onStatus={setHotelStatusAdmin.bind(null, project, id)}
      onNotes={saveHotelNotesAdmin.bind(null, project, id)}
    />
  );
}
