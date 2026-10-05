import { redirect } from "next/navigation";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, requirePortalUser } from "@/lib/portal/auth";
import { presignDownload, isStorageConfigured } from "@/lib/storage";
import { Card, PageHeader } from "@/components/dashboard/ui";
import PlannerCalendar from "@/components/dashboard/social/PlannerCalendar";
import NeedsChangesAlert, { type FlaggedPost } from "@/components/portal/NeedsChangesAlert";
import { plannerDayLabel } from "@/lib/post-review";
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
  const posts = ((data ?? []) as ScheduledPost[])
    .filter((p) => canView || p.uploaded_by_email)
    // A post I uploaded and held back is mine to fix — to the client it's
    // just "being prepared".
    .map((p) => (p.status === "needs_changes" && !p.uploaded_by_email ? { ...p, status: "pending_caption" as const, review_note: null } : p));
  const withUrls = await Promise.all(posts.map(async (p) => ({ ...p, imageUrl: await presignDownload(p.media_key).catch(() => null) })));

  // Their uploads that need a change, across every project they can see —
  // the popup and banner above the calendar. Fixing needs "uploads".
  let flagged: FlaggedPost[] = [];
  if (canUpload) {
    const names = new Map(projects.map((p) => [p.id as string, p.name as string]));
    const { data: rows } = await db
      .from("scheduled_posts")
      .select("id, project_id, original_filename, scheduled_at, review_note, media_key")
      .in("project_id", [...names.keys()])
      .eq("status", "needs_changes")
      .not("uploaded_by_email", "is", null)
      .order("scheduled_at", { ascending: true });
    flagged = await Promise.all(
      ((rows ?? []) as Pick<ScheduledPost, "id" | "project_id" | "original_filename" | "scheduled_at" | "review_note" | "media_key">[]).map(async (r) => ({
        id: r.id,
        project_id: r.project_id,
        projectName: names.get(r.project_id) ?? "",
        original_filename: r.original_filename,
        dayLabel: plannerDayLabel(r.scheduled_at),
        review_note: r.review_note ?? null,
        imageUrl: await presignDownload(r.media_key).catch(() => null),
      }))
    );
  }

  return (
    <>
      <PageHeader title="Planner" description={description} />
      {can(ctx, "uploads") && !isStorageConfigured && (
        <Card variant="solid" className="p-5 mb-5">
          <p className="text-small text-ink-muted">Uploads aren&apos;t available right now — please send graphics to me directly.</p>
        </Card>
      )}
      <NeedsChangesAlert posts={flagged} />
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
