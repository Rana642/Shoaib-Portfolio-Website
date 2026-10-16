import { FolderSync } from "lucide-react";
import { Card, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { removeStoryDriveFolder, saveStoryDriveFolder, syncStoryDriveNow } from "@/lib/dashboard/actions/story-drive";
import type { StoryDriveSource } from "@/lib/story-drive";

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The Stories Planner's Google Drive folder: link, stories per day, sync. */
export default function StoryDriveCard({ projectId, source, notice }: { projectId: string; source: StoryDriveSource | null; notice?: { ok: boolean; text: string } | null }) {
  const r = source?.last_result;
  return (
    <Card className="p-5 mb-5">
      <div className="flex flex-col lg:flex-row gap-5">
        <div className="lg:w-80 shrink-0">
          <p className="flex items-center gap-2 font-medium">
            <FolderSync className="size-4" aria-hidden /> Stories from Google Drive
          </p>
          <p className="text-small text-ink-muted mt-1">
            Share the folder as &quot;Anyone with the link&quot;. New images and videos are added as Stories every hour, in random order, at the
            followers&apos; most active times. Videos over 60s skip Facebook.
          </p>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <form action={saveStoryDriveFolder} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <input type="hidden" name="project_id" value={projectId} />
            <div className="flex-1 min-w-0">
              <label htmlFor="folder_url" className={labelClasses}>Drive folder link</label>
              <input id="folder_url" name="folder_url" defaultValue={source?.folder_url ?? ""} required placeholder="https://drive.google.com/drive/folders/…" className={inputClasses} />
            </div>
            <div className="w-28">
              <label htmlFor="per_day" className={labelClasses}>Per day</label>
              <input id="per_day" name="per_day" type="number" min={1} max={20} defaultValue={source?.per_day ?? 8} className={inputClasses} />
            </div>
            <button type="submit" className={buttonStyles.primary}>{source ? "Save" : "Connect folder"}</button>
          </form>
          {source && (
            <div className="flex flex-wrap items-center gap-3 text-small">
              <form action={syncStoryDriveNow}>
                <input type="hidden" name="project_id" value={projectId} />
                <button type="submit" className={buttonStyles.secondary}>Sync now</button>
              </form>
              <form action={removeStoryDriveFolder}>
                <input type="hidden" name="project_id" value={projectId} />
                <button type="submit" className="text-ink-subtle hover:text-red-700 underline">Disconnect folder</button>
              </form>
              {source.slot_hours?.length ? (
                <span className="text-ink-muted">Times (PKT): {source.slot_hours.map((h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`).join(" · ")}</span>
              ) : null}
            </div>
          )}
          {notice && <p className={notice.ok ? "text-small text-green-700" : "text-small text-red-700"}>{notice.text}</p>}
          {r && (
            <div className="text-small text-ink-muted space-y-1">
              <p>
                Last sync {pkt(r.at)}: {r.error ? <span className="text-red-700">{r.error}</span> : `${r.imported} added${r.waiting ? `, ${r.waiting} waiting for the next sync` : ""}.`}
              </p>
              {r.skipped.length > 0 && (
                <ul className="list-disc pl-5">
                  {r.skipped.slice(0, 8).map((s) => (
                    <li key={s.name}>
                      {s.name}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
