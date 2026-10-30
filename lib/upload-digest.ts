import "server-only";
import { db } from "./dashboard/db";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { siteUrl } from "./seo";
import { plannerDayLabel } from "./post-review";

/**
 * Client-portal uploads are reported in ONE email per uploader session, not
 * one per upload (Shoaib, 2026-10-30: "1 aik post upload kerny ka alert nai
 * ana chaiye … ikathi report ajaye k kis kis project ki post upload ki hai").
 * Each upload or fixed re-upload marks its post with client_activity. The
 * social cron (every 15 min) sends the report once that person has been quiet
 * for QUIET_MS — or after MAX_SESSION_MS of non-stop uploading — and clears
 * the marks.
 */

const QUIET_MS = 30 * 60_000;
const MAX_SESSION_MS = 3 * 3600_000;

export type ClientActivity = {
  at: string;
  /** The portal user's email. */
  by: string;
  kind: "upload" | "fix";
  note?: string | null;
  /** For a fix: the image it replaced and what needed changing. */
  fixed?: { from: string; issue: string | null };
};

type Row = { id: string; project_id: string; original_filename: string; scheduled_at: string | null; client_activity: ClientActivity };

/** Marks posts for the next upload report. False when that isn't possible yet (no client_activity column). */
export async function markClientActivity(postIds: string[], activity: ClientActivity): Promise<boolean> {
  if (!postIds.length) return true;
  const { error } = await db.from("scheduled_posts").update({ client_activity: activity }).in("id", postIds);
  return !error;
}

const pktTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Sends the report for every uploader whose session has ended. Returns emails sent. */
export async function sendUploadReports(): Promise<number> {
  if (!isResendConfigured) return 0;
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id, project_id, original_filename, scheduled_at, client_activity")
    .not("client_activity", "is", null)
    .limit(1000);
  if (error || !data?.length) return 0;

  const byUploader = new Map<string, Row[]>();
  for (const r of data as Row[]) byUploader.set(r.client_activity.by, [...(byUploader.get(r.client_activity.by) ?? []), r]);

  const projectIds = [...new Set((data as Row[]).map((r) => r.project_id))];
  const { data: projects } = await db.from("client_projects").select("id, name, client:clients(name)").in("id", projectIds);
  const projectName = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]));
  const clientName = new Map((projects ?? []).map((p) => [p.id as string, (p.client as { name?: string } | null)?.name ?? ""]));

  let sent = 0;
  const now = Date.now();
  for (const [who, rows] of byUploader) {
    const times = rows.map((r) => new Date(r.client_activity.at).getTime());
    const first = Math.min(...times);
    const last = Math.max(...times);
    if (now - last < QUIET_MS && now - first < MAX_SESSION_MS) continue; // still uploading

    const perProject = new Map<string, Row[]>();
    for (const r of rows) perProject.set(r.project_id, [...(perProject.get(r.project_id) ?? []), r]);
    const projectList = [...perProject.entries()].sort((a, b) => b[1].length - a[1].length);

    const summary = projectList.map(([pid, list]) => `${projectName.get(pid) ?? "A project"} ${list.length}`).join(" · ");
    const uploads = rows.filter((r) => r.client_activity.kind === "upload").length;
    const fixes = rows.length - uploads;
    const counts = [uploads && `${uploads} post${uploads === 1 ? "" : "s"}`, fixes && `${fixes} fix${fixes === 1 ? "" : "es"}`].filter(Boolean).join(" + ");

    const lines: string[] = [];
    for (const [pid, list] of projectList) {
      const added = list.filter((r) => r.client_activity.kind === "upload");
      const fixed = list.filter((r) => r.client_activity.kind === "fix");
      lines.push(`${projectName.get(pid) ?? "A project"}: ${[added.length && `${added.length} new`, fixed.length && `${fixed.length} fixed`].filter(Boolean).join(", ")}`);
      const byDay = new Map<string, string[]>();
      for (const r of added) {
        const day = plannerDayLabel(r.scheduled_at);
        byDay.set(day, [...(byDay.get(day) ?? []), r.original_filename]);
      }
      for (const [day, files] of byDay) lines.push(`  For ${day}: ${files.join(", ")}`);
      for (const r of fixed) {
        const f = r.client_activity.fixed;
        lines.push(`  Fixed: ${f?.from ?? "a post"} → ${r.original_filename} (${plannerDayLabel(r.scheduled_at)})${f?.issue ? ` — needed: ${f.issue}` : ""}`);
      }
      for (const note of new Set(list.map((r) => r.client_activity.note).filter(Boolean))) lines.push(`  Note: ${note}`);
      lines.push("");
    }

    const client = clientName.get(rows[0].project_id);
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Upload report: ${who} — ${counts} (${summary})`,
      text: [
        `${who}${client ? ` (${client})` : ""} uploaded through the client portal, ${pktTime(first)}${last - first > 60_000 ? ` – ${pktTime(last).split(", ").pop()}` : ""} (PKT):`,
        ``,
        ...lines,
        `They're on the Planner, waiting for captions: ${siteUrl}/dashboard/social/planner`,
      ].join("\n"),
    });
    if (sendError) continue; // the marks stay, so the next run tries again

    await db.from("scheduled_posts").update({ client_activity: null }).in("id", rows.map((r) => r.id));
    sent++;
  }
  return sent;
}
