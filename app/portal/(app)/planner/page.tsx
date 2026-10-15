import PortalPlannerScreen from "@/components/portal/PortalPlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

export default async function PortalPlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <PortalPlannerScreen project={project} section="feed" />;
}
