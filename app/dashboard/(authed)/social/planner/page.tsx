import PlannerScreen from "@/components/dashboard/social/PlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <PlannerScreen projectParam={project} section="feed" />;
}
