import "server-only";
import { db } from "./dashboard/db";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { siteUrl } from "./seo";

/**
 * Stories fed from a Google Drive folder must not stop unnoticed (Shoaib,
 * 2026-10-30, for TONI&GUY: "Stories nai rukni chaiye … inform kerna hai k
 * stories ruk gai"). The social cron runs this every 15 minutes. When a
 * project's Stories stop — a story failed, one is stuck past its time, the
 * next 24 hours are empty, or the Drive sync errors or hasn't run — Shoaib
 * gets one email, a reminder if it's still stopped 12 hours later, and one
 * more when Stories run again.
 *
 * State lives in story_drive_sources.alert. Until that column exists (one
 * line in supabase/dashboard-schema.sql) the watchdog stays quiet.
 */

const STUCK_AFTER_MS = 90 * 60_000;
const FAILED_WINDOW_MS = 6 * 3600_000;
const AHEAD_MS = 24 * 3600_000;
const SYNC_STALE_MS = 6 * 3600_000;
const REMIND_EVERY_MS = 12 * 3600_000;

type AlertState = { active: boolean; at: string; problems: string[] };
type StoryRow = { original_filename: string; scheduled_at: string; result: Record<string, unknown> | null };

const pkt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const firstError = (row: StoryRow): string => {
  const r = (row.result ?? {}) as { platforms?: { ok: boolean; error?: string }[]; held?: { error?: string } };
  const err = r.held?.error ?? r.platforms?.find((p) => !p.ok)?.error ?? "";
  return err.replace(/\s+/g, " ").slice(0, 160);
};

/** What's wrong with a project's Drive Stories right now (empty = running fine). */
export async function driveStoryProblems(projectId: string, lastSyncedAt: string | null, lastResult: { error?: string } | null): Promise<string[]> {
  const now = Date.now();
  const stories = () => db.from("scheduled_posts").select("original_filename, scheduled_at, result").eq("project_id", projectId).eq("post_type", "story");
  const [failed, stuck, ahead] = await Promise.all([
    stories().eq("status", "failed").gte("scheduled_at", new Date(now - FAILED_WINDOW_MS).toISOString()).order("scheduled_at", { ascending: false }).limit(20),
    stories().eq("status", "scheduled").lte("scheduled_at", new Date(now - STUCK_AFTER_MS).toISOString()).order("scheduled_at").limit(20),
    db
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("post_type", "story")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date(now).toISOString())
      .lte("scheduled_at", new Date(now + AHEAD_MS).toISOString()),
  ]);

  const problems: string[] = [];
  const failedRows = (failed.data ?? []) as StoryRow[];
  if (failedRows.length) {
    const last = failedRows[0];
    problems.push(`${failedRows.length} ${failedRows.length === 1 ? "story" : "stories"} failed in the last 6 hours — latest ${last.original_filename} (${pkt(last.scheduled_at)}): ${firstError(last)}`);
  }
  const stuckRows = (stuck.data ?? []) as StoryRow[];
  if (stuckRows.length) {
    const oldest = stuckRows[0];
    const why = firstError(oldest);
    problems.push(`${stuckRows.length} ${stuckRows.length === 1 ? "story is" : "stories are"} past their time and not posted — oldest ${oldest.original_filename} (due ${pkt(oldest.scheduled_at)})${why ? `: ${why}` : ""}`);
  }
  if (!ahead.error && (ahead.count ?? 0) === 0) problems.push("No stories on the calendar for the next 24 hours.");
  if (lastResult?.error && !lastResult.error.startsWith("A sync is already running")) problems.push(`The Drive folder sync failed: ${lastResult.error}`);
  if (!lastSyncedAt || now - new Date(lastSyncedAt).getTime() > SYNC_STALE_MS) {
    problems.push(`The Drive folder hasn't synced since ${lastSyncedAt ? pkt(lastSyncedAt) : "it was added"}, so new stories aren't being added.`);
  }
  return problems;
}

/** Emails when a project's Drive Stories stop, and when they run again. Returns emails sent. */
export async function watchDriveStories(): Promise<number> {
  if (!isResendConfigured) return 0;
  const { data: sources } = await db.from("story_drive_sources").select("*, project:client_projects(name)");
  let sent = 0;
  for (const s of (sources ?? []) as Record<string, unknown>[]) {
    if (!("alert" in s)) continue; // the alert column isn't added yet
    const projectId = s.project_id as string;
    const name = (s.project as { name?: string } | null)?.name ?? "A project";
    const alert = s.alert as AlertState | null;
    const problems = await driveStoryProblems(projectId, s.last_synced_at as string | null, s.last_result as { error?: string } | null);
    const link = `${siteUrl}/dashboard/social/stories?project=${projectId}`;

    let next: AlertState | null = null;
    if (problems.length && (!alert?.active || Date.now() - new Date(alert.at).getTime() > REMIND_EVERY_MS)) {
      await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: `${name}: Stories have stopped${alert?.active ? " (still)" : ""}`,
        text: [`${name}'s Stories are not going out as they should:`, ``, ...problems.map((p) => `• ${p}`), ``, `Check: ${link}`, ``, `You'll get a reminder if this is still the case in 12 hours, and an email when Stories run again.`].join("\n"),
      });
      next = { active: true, at: new Date().toISOString(), problems };
    } else if (!problems.length && alert?.active) {
      await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: `${name}: Stories are running again`,
        text: [`${name}'s Stories are going out again and the next 24 hours are on the calendar.`, ``, `Earlier problem: ${alert.problems.join(" / ")}`, ``, link].join("\n"),
      });
      next = { active: false, at: new Date().toISOString(), problems: [] };
    }
    if (next) {
      await db.from("story_drive_sources").update({ alert: next }).eq("project_id", projectId);
      sent++;
    }
  }
  return sent;
}
