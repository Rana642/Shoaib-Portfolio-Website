import PlannerScreen from "@/components/dashboard/social/PlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stories" };

export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <PlannerScreen projectParam={project} section="stories" />;
}
