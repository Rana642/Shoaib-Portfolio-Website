import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { presignDownload, isStorageConfigured } from "@/lib/storage";
import { Card, PageHeader } from "@/components/dashboard/ui";
import PlannerCalendar from "@/components/dashboard/social/PlannerCalendar";
import type { ScheduledPost } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

/**
 * The client's content planner — the same Week/Month calendar as my
 * dashboard, in client mode: they see what's coming up and what's gone out
 * for one of their projects, and (with "uploads") add final graphics onto a
 * day. Someone with uploads but not the planner only sees their own team's
 * uploads. Failed posts never show here (they're mine to fix).
 */
export default async function PortalPlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requirePortalUser();
  const canView = can(ctx, "planner");
  const canUpload = can(ctx, "uploads") && isStorageConfigured;
  if (!canView && !can(ctx, "uploads")) redirect("/portal");

  const description = canView
    ? `What's coming up and what's gone out.${canUpload ? " Add final graphics on any day — I'll write the captions and schedule them." : ""}`
    : "Your uploads and where they are. Add final graphics on any day — I'll write the captions and schedule them.";

  const { project } = await searchParams;
  const { data: all } = await db.from("client_projects").select("id, name").eq("client_id", ctx.clientId).order("sort_order");
  const projects = (all ?? []).filter((p) => canSeeProject(ctx, p.id as string));
  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Planner" />
        <Card variant="solid" className="p-6">
          <p className="text-small text-ink-muted">There are no projects here yet — I&apos;ll set one up for you.</p>
        </Card>
      </>
    );
  }
  const selected = projects.find((p) => p.id === project) ?? projects[0];

  const { data } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("project_id", selected.id)
    .neq("status", "failed")
    .order("scheduled_at", { ascending: true });
  const posts = ((data ?? []) as ScheduledPost[]).filter((p) => canView || p.uploaded_by_email);
  const withUrls = await Promise.all(posts.map(async (p) => ({ ...p, imageUrl: await presignDownload(p.media_key).catch(() => null) })));

  return (
    <>
      <PageHeader title="Planner" description={description} />
      {can(ctx, "uploads") && !isStorageConfigured && (
        <Card variant="solid" className="p-5 mb-5">
          <p className="text-small text-ink-muted">Uploads aren&apos;t available right now — please send graphics to me directly.</p>
        </Card>
      )}
      <PlannerCalendar
        mode="client"
        canUpload={canUpload}
        plannerPath="/portal/planner"
        projects={projects.map((p) => ({ id: p.id as string, label: p.name as string, name: p.name as string, client: "", client_id: ctx.clientId }))}
        selectedProjectId={selected.id as string}
        posts={withUrls}
        connectedPlatforms={[]}
      />
    </>
  );
}
