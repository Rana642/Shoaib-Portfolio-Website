import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";
import { Card } from "@/components/dashboard/ui";
import { InquiriesView } from "@/components/whatsapp/HotelCrmViews";
import { portalSetInquiryStatus } from "@/lib/portal/bookings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inquiries" };

export default async function PortalInquiriesPage() {
  const ctx = await requirePortalUser();
  if (!can(ctx, "bookings")) redirect("/portal");
  const { active } = await activeProject(ctx);
  const { data: sources } = active ? await db.from("project_booking_sources").select("project_id").eq("project_id", active.id).limit(1) : { data: [] };
  if (!active || !(sources ?? []).length) {
    return (
      <Card variant="solid" className="p-6">
        <p className="text-small text-ink-muted">Not connected yet{active ? ` for ${active.name}` : ""} — I&apos;ll set this up for you.</p>
      </Card>
    );
  }
  return (
    <>
      <h1 className="sr-only">Inquiries</h1>
      <InquiriesView projectId={active.id} onStatus={portalSetInquiryStatus} />
    </>
  );
}
