import PlannerScreen from "@/components/dashboard/social/PlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Planner" };


// "Publish now" runs here and can wait ~30 s on an Instagram upload.
export const maxDuration = 60;
export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <PlannerScreen projectParam={project} section="feed" />;
}
