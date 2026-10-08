import { db } from "@/lib/dashboard/db";
import { Card } from "@/components/dashboard/ui";
import BookingsView from "@/components/whatsapp/BookingsView";
import HotelSectionNav from "@/components/whatsapp/HotelSectionNav";
import BookingSourceForm from "@/components/dashboard/BookingSourceForm";
import { removeBookingSource, saveBookingSource } from "@/lib/dashboard/actions/booking-sources";
import { setBookingSource } from "@/lib/dashboard/actions/booking-overrides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

/**
 * Bookings for businesses that take them (hotels): their website's own
 * bookings, read live, plus bookings marked from WhatsApp. The same view
 * appears in each client's portal.
 */
export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const [{ data: sources }, { data: waAccounts }] = await Promise.all([
    db.from("project_booking_sources").select("project_id, kind, supabase_url"),
    db.from("wa_accounts").select("project_id").not("project_id", "is", null),
  ]);
  const ids = new Set([...(sources ?? []).map((s) => s.project_id as string), ...(waAccounts ?? []).map((a) => a.project_id as string)]);

  // Hotels: any project with a booking source or WhatsApp, plus any project named like a hotel so it can be connected.
  const { data: projectRows } = await db.from("client_projects").select("id, name, clients(name)").order("name");
  const projects = ((projectRows ?? []) as unknown as { id: string; name: string; clients: { name: string } | null }[]).filter(
    (p) => ids.has(p.id) || /hotel/i.test(p.name)
  );
  const selected = projects.find((p) => p.id === project) ?? projects[0];
  const source = (sources ?? []).find((s) => s.project_id === selected?.id);

  async function save(formData: FormData) {
    "use server";
    return saveBookingSource(selected!.id, formData);
  }
  async function remove() {
    "use server";
    return removeBookingSource(selected!.id);
  }

  return (
    <>
      <h1 className="sr-only">Bookings</h1>
      {!selected ? (
        <Card className="p-6">
          <p className="text-small text-ink-muted">No hotel businesses yet.</p>
        </Card>
      ) : (
        <>
          <Card className="px-5 py-3 mb-5">
            <BookingSourceForm
              connected={!!source}
              kind={(source?.kind as string) ?? null}
              url={(source?.supabase_url as string) ?? null}
              onSave={save}
              onRemove={remove}
            />
          </Card>
          <BookingsView
            projectId={selected.id}
            detailBase={`/dashboard/bookings/${selected.id}`}
            chatBase="/dashboard/whatsapp?chat="
            setSource={setBookingSource}
            switcher={<HotelSectionNav base="/dashboard/bookings" projects={projects.map((p) => ({ id: p.id, name: p.name }))} projectId={selected.id} />}
          />
        </>
      )}
    </>
  );
}
