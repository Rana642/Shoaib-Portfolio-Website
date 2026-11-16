import PortalPlannerScreen from "@/components/portal/PortalPlannerScreen";
import { requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

export default async function PortalPlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  // The business chosen in the sidebar, unless a link names one.
  const { active } = await activeProject(await requirePortalUser());
  return <PortalPlannerScreen project={project ?? active?.id} section="feed" />;
}
