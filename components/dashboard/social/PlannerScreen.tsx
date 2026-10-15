import { db } from "@/lib/dashboard/db";
import { presignDownload } from "@/lib/storage";
import { GBP_PLATFORM, gbpPlannerLocation } from "@/lib/gbp";
import { listProjectOptions } from "@/lib/dashboard/projects";
import { PageHeader, EmptyState, LinkButton } from "@/components/dashboard/ui";
import PlannerCalendar from "@/components/dashboard/social/PlannerCalendar";
import { plannerDayNotes } from "@/lib/planner-day-notes";
import type { ScheduledPost } from "@/lib/dashboard/types";

const COPY = {
  feed: {
    title: "Planner",
    description: "Posts, Reels & Shorts and Videos on one calendar, one project at a time. Pick a tab to work on one kind.",
  },
  stories: {
    title: "Stories",
    description: "Facebook and Instagram Stories, planned on their own calendar. Stories carry no caption and last 24 hours.",
  },
};

/** The dashboard Planner page — shared by the main Planner and the
 *  separate Stories Planner (`section`). */
export default async function PlannerScreen({ projectParam, section }: { projectParam?: string; section: "feed" | "stories" }) {
  const projects = await listProjectOptions();

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title={COPY[section].title} description={COPY[section].description} />
        <EmptyState
          title="No projects yet"
          description="Every client needs at least one project (client_projects) before you can plan posts. Add one from a client's page."
          action={<LinkButton href="/dashboard/clients">Go to Clients</LinkButton>}
        />
      </>
    );
  }

  const selectedProjectId = projects.some((p) => p.id === projectParam) ? projectParam! : projects[0].id;

  const [{ data: posts }, { data: accounts }, day] = await Promise.all([
    db
      .from("scheduled_posts")
      .select("*")
      .eq("project_id", selectedProjectId)
      .order("scheduled_at", { ascending: true, nullsFirst: true }),
    db.from("client_social_accounts").select("platform").eq("project_id", selectedProjectId).eq("is_active", true),
    plannerDayNotes(selectedProjectId),
  ]);
  const connectedPlatforms = [...new Set((accounts ?? []).map((a) => a.platform as string))];
  // Google Business counts as connected once the project has a chosen
  // location (/dashboard/gbp) — its posts go out through the pacing gate.
  if (await gbpPlannerLocation(selectedProjectId).catch(() => null)) connectedPlatforms.push(GBP_PLATFORM);

  const postsWithUrls = await Promise.all(
    ((posts ?? []) as ScheduledPost[]).map(async (p) => ({
      ...p,
      // For a Reel this is the video; its cover (if any) comes separately.
      imageUrl: await presignDownload(p.media_key).catch(() => null),
      coverUrl: p.cover_key ? await presignDownload(p.cover_key).catch(() => null) : null,
    }))
  );

  return (
    <>
      <PageHeader title={COPY[section].title} description={COPY[section].description} />
      <PlannerCalendar
        projects={projects}
        selectedProjectId={selectedProjectId}
        posts={postsWithUrls}
        connectedPlatforms={connectedPlatforms}
        dayNotes={day.notes}
        weatherCity={day.city}
        section={section}
        plannerPath={section === "stories" ? "/dashboard/social/stories" : "/dashboard/social/planner"}
      />
    </>
  );
}
