import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { Card, PageHeader } from "@/components/dashboard/ui";
import HotelSectionNav from "@/components/whatsapp/HotelSectionNav";
import { ContactsView } from "@/components/whatsapp/HotelCrmViews";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacts" };

export default async function PortalContactsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings")) redirect("/portal");
  const { project } = await searchParams;
  const { data: projectRows } = await db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order");
  const visible = (projectRows ?? []).filter((p) => canSeeProject(ctx, p.id as string));
  const { data: sources } = visible.length
    ? await db.from("project_booking_sources").select("project_id").in("project_id", visible.map((p) => p.id as string))
    : { data: [] };
  const projects = visible.filter((p) => (sources ?? []).some((s) => s.project_id === p.id)) as { id: string; name: string }[];
  if (!projects.length) {
    return (
      <Card variant="solid" className="p-6">
        <p className="text-small text-ink-muted">Not connected yet — I&apos;ll set this up for you.</p>
      </Card>
    );
  }
  const selected = projects.find((p) => p.id === project) ?? projects[0];
  return (
    <>
      <PageHeader title="Contacts" description="Every guest who booked or inquired, merged by phone number." />
      <HotelSectionNav base="/portal/bookings" section="contacts" projects={projects} projectId={selected.id} />
      <ContactsView projectId={selected.id} name={selected.name} />
    </>
  );
}
