import { db } from "@/lib/dashboard/db";
import { Card, PageHeader } from "@/components/dashboard/ui";
import HotelSectionNav from "@/components/whatsapp/HotelSectionNav";
import { InquiriesView } from "@/components/whatsapp/HotelCrmViews";
import { setInquiryStatusAdmin } from "@/lib/dashboard/actions/booking-overrides";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inquiries" };

export default async function DashboardInquiriesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const { data: sources } = await db.from("project_booking_sources").select("project_id, client_projects(id, name)");
  const projects = ((sources ?? []) as unknown as { client_projects: { id: string; name: string } | null }[])
    .map((s) => s.client_projects)
    .filter((p): p is { id: string; name: string } => !!p);
  if (!projects.length) {
    return (
      <Card className="p-6">
        <p className="text-small text-ink-muted">No hotel website connected yet (Bookings → connect).</p>
      </Card>
    );
  }
  const selected = projects.find((p) => p.id === project) ?? projects[0];
  return (
    <>
      <PageHeader title="Inquiries" description="Each hotel website's leads, read live. Clients see the same in their portal." />
      <HotelSectionNav base="/dashboard/bookings" section="inquiries" projects={projects} projectId={selected.id} />
      <InquiriesView projectId={selected.id} onStatus={setInquiryStatusAdmin} />
    </>
  );
}
