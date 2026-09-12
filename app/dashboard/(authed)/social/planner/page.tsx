import { db } from "@/lib/dashboard/db";
import { presignDownload } from "@/lib/storage";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import PlannerCalendar from "@/components/dashboard/social/PlannerCalendar";
import type { ScheduledPost } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectParam } = await searchParams;
  const projects = await listProjectOptions();

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Planner" description="Upload images to a calendar and schedule them per client project." />
        <EmptyState
          title="No projects yet"
          description="Every client needs at least one project (client_projects) before you can plan posts. Add one from a client's page."
          action={<LinkButton href="/dashboard/clients">Go to Clients</LinkButton>}
        />
      </>
    );
  }

  const selectedProjectId = projects.some((p) => p.id === projectParam) ? projectParam! : projects[0].id;

  const { data: posts } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("project_id", selectedProjectId)
    .order("scheduled_at", { ascending: true, nullsFirst: true });

  const postsWithUrls = await Promise.all(
    ((posts ?? []) as ScheduledPost[]).map(async (p) => ({
      ...p,
      imageUrl: await presignDownload(p.media_key).catch(() => null),
    }))
  );

  return (
    <>
      <PageHeader
        title="Planner"
        description="Upload images straight onto a date — one place to upload, one project at a time. Add more than one post to the same day whenever you like."
      />
      <PlannerCalendar projects={projects} selectedProjectId={selectedProjectId} posts={postsWithUrls} />
    </>
  );
}
