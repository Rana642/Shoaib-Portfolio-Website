import PortalPlannerScreen from "@/components/portal/PortalPlannerScreen";
import { requirePortalUser } from "@/lib/portal/auth";
import { activeProject } from "@/lib/portal/active-project";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stories" };

export default async function PortalStoriesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const { active } = await activeProject(await requirePortalUser());
  return <PortalPlannerScreen project={project ?? active?.id} section="stories" />;
}
