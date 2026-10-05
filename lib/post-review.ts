import "server-only";
import { db } from "./dashboard/db";
import { presignDownload } from "./storage";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { postChangesRequestEmail } from "./email-templates";
import { siteUrl } from "./seo";
import type { ScheduledPost } from "./dashboard/types";

// "Needs changes" (Shoaib, 2026-10-05): when a planner upload has a mistake
// (a wrong photo, an unsuitable icon, a wrong phone number…), it's held
// instead of scheduled, and whoever uploaded it is told what to fix — a
// popup on their portal Planner and one email per batch. They replace the
// image (same day, same slot) and it comes back as 'pending_caption'.

const SETUP_MESSAGE =
  "“Needs changes” needs a one-time database update — run the “Planner: needs changes” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";
// Postgres check_violation (the old status list) / PostgREST unknown column.
const isSetupError = (e: { code?: string } | null) => e?.code === "23514" || e?.code === "PGRST204";

/** Statuses a post can be flagged from — nothing already handed to the
 *  publisher (that would need unscheduling first). */
const FLAGGABLE = new Set(["pending_caption", "needs_changes"]);

/** "Mon, 5 Oct" in Pakistan time. */
export function plannerDayLabel(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });
}

export type ChangeRequest = { postId: string; issue: string };

export type FlagOutcome = {
  flagged: { postId: string; project: string; filename: string; uploadedBy: string | null }[];
  skipped: { postId: string; reason: string }[];
  emails: { to: string; posts: number; sent: boolean; error?: string }[];
};

/** Marks posts "needs changes" with what's wrong, then emails each uploader
 *  once, listing all of their posts in this batch (a copy goes to Shoaib).
 *  Posts Shoaib uploaded himself just show the flag on his Planner. */
export async function flagPostsForChanges(requests: ChangeRequest[], { notify = true } = {}): Promise<FlagOutcome> {
  const ids = [...new Set(requests.map((r) => r.postId))];
  const { data, error } = await db.from("scheduled_posts").select("*, client_projects(name)").in("id", ids);
  if (error) throw new Error(error.message);
  const rows = new Map(((data ?? []) as (ScheduledPost & { client_projects: { name: string } | null })[]).map((r) => [r.id, r]));

  const outcome: FlagOutcome = { flagged: [], skipped: [], emails: [] };
  const byUploader = new Map<string, { post: ScheduledPost; project: string; issue: string }[]>();
  const now = new Date().toISOString();

  for (const { postId, issue } of requests) {
    const post = rows.get(postId);
    if (!post) {
      outcome.skipped.push({ postId, reason: "No post with this id." });
      continue;
    }
    if (!FLAGGABLE.has(post.status)) {
      outcome.skipped.push({ postId, reason: `It is already ${post.status} — only posts waiting for a caption can be flagged.` });
      continue;
    }
    const { error: upErr } = await db
      .from("scheduled_posts")
      .update({ status: "needs_changes", review_note: issue.trim(), review_flagged_at: now })
      .eq("id", postId);
    if (isSetupError(upErr)) throw new Error(SETUP_MESSAGE);
    if (upErr) throw new Error(upErr.message);

    const project = post.client_projects?.name ?? "Your project";
    outcome.flagged.push({ postId, project, filename: post.original_filename, uploadedBy: post.uploaded_by_email ?? null });
    if (post.uploaded_by_email) {
      byUploader.set(post.uploaded_by_email, [...(byUploader.get(post.uploaded_by_email) ?? []), { post, project, issue: issue.trim() }]);
    }
  }

  if (notify) {
    for (const [to, items] of byUploader) {
      if (!isResendConfigured) {
        outcome.emails.push({ to, posts: items.length, sent: false, error: "Email isn't set up (RESEND_API_KEY)." });
        continue;
      }
      const emailItems = await Promise.all(
        items.map(async ({ post, project, issue }) => {
          const isVideo = post.post_type === "reel" || /\.(mp4|mov)$/i.test(post.media_key);
          const still = isVideo ? post.cover_key : post.media_key;
          return {
            project,
            filename: post.original_filename,
            date: plannerDayLabel(post.scheduled_at),
            issue,
            // 7 days — the longest a presigned link can live.
            imageUrl: still ? await presignDownload(still, undefined, 7 * 24 * 3600).catch(() => null) : null,
          };
        })
      );
      const projects = [...new Set(items.map((i) => i.project))];
      const n = items.length;
      try {
        const { error: sendErr } = await resend.emails.send({
          from: fromEmail,
          to,
          bcc: toEmail,
          replyTo: toEmail,
          subject: `${projects.length === 1 ? `${projects[0]}: ` : ""}${n} post${n === 1 ? " needs" : "s need"} a change before ${n === 1 ? "it goes" : "they go"} out`,
          html: postChangesRequestEmail({ items: emailItems, plannerUrl: `${siteUrl}/portal/planner?project=${items[0].post.project_id}` }),
        });
        outcome.emails.push(sendErr ? { to, posts: n, sent: false, error: sendErr.message } : { to, posts: n, sent: true });
      } catch (e) {
        outcome.emails.push({ to, posts: n, sent: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return outcome;
}

/** Puts a flagged post back to "waiting for a caption" without a new image
 *  (Shoaib decided it's fine as it is). */
export async function clearPostFlag(postId: string): Promise<void> {
  const { data, error } = await db
    .from("scheduled_posts")
    .update({ status: "pending_caption", review_note: null, review_flagged_at: null })
    .eq("id", postId)
    .eq("status", "needs_changes")
    .select("id");
  if (isSetupError(error)) throw new Error(SETUP_MESSAGE);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That post isn't marked as needing changes.");
}

/** Swaps a flagged post's image for the corrected one — same day, same
 *  slot — and sends it back for a caption. Returns the replaced post as it
 *  was (its old image key and the issue that was fixed). */
export async function replaceFlaggedPostMedia(postId: string, media: { key: string; name: string }): Promise<ScheduledPost> {
  const { data: before, error: readErr } = await db.from("scheduled_posts").select("*").eq("id", postId).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!before || before.status !== "needs_changes") throw new Error("This post doesn't need changes any more.");
  const { error } = await db
    .from("scheduled_posts")
    .update({ media_key: media.key, original_filename: media.name, status: "pending_caption", review_note: null, review_flagged_at: null })
    .eq("id", postId)
    .eq("status", "needs_changes");
  if (error) throw new Error(error.message);
  return before as ScheduledPost;
}
