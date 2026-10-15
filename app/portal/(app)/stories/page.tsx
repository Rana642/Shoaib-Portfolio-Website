import PortalPlannerScreen from "@/components/portal/PortalPlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stories" };

export default async function PortalStoriesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <PortalPlannerScreen project={project} section="stories" />;
}
