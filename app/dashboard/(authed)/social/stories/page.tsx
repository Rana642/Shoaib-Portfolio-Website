import PlannerScreen from "@/components/dashboard/social/PlannerScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stories" };

const DRIVE_NOTICE: Record<string, string> = {
  saved: "Folder saved and synced — new Stories are on the calendar below.",
  synced: "Synced with the Drive folder.",
  removed: "Folder disconnected. Stories already on the calendar stay.",
};

export default async function StoriesPage({ searchParams }: { searchParams: Promise<{ project?: string; drive?: string; drive_error?: string }> }) {
  const { project, drive, drive_error } = await searchParams;
  const driveNotice = drive_error
    ? { ok: false, text: drive_error.slice(0, 300) }
    : drive && DRIVE_NOTICE[drive]
      ? { ok: true, text: DRIVE_NOTICE[drive] }
      : null;
  return <PlannerScreen projectParam={project} section="stories" driveNotice={driveNotice} />;
}
