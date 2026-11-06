import "server-only";
import { db } from "./dashboard/db";
import { getScheduledPost } from "./scheduled-posts";
import { checkCaption, checkDuplicates, checkSchedule, formatFindings, type Finding, type PastPost } from "./post-preflight-checks";

/**
 * Runs the pre-flight checks on one Planner post. `caption` and `scheduledAt`
 * are the values about to be saved (so the check can run before scheduling).
 * Nothing is changed or blocked here: the caller shows the findings.
 */
export async function preflightPost(input: { postId: string; caption?: string; scheduledAt?: string }): Promise<{ findings: Finding[]; text: string }> {
  const post = await getScheduledPost(input.postId);
  if (!post) throw new Error(`No post found with id '${input.postId}'.`);

  const caption = input.caption ?? post.caption ?? "";
  const scheduledAt = input.scheduledAt ?? post.scheduled_at;
  const findings: Finding[] = [];

  if (caption.trim()) findings.push(...checkCaption(caption));
  else findings.push({ code: "no-caption", severity: "check", en: "The post has no caption yet.", ur: "Post ka abhi caption nahi hai." });
  findings.push(...checkSchedule(scheduledAt));

  // The project's posts from the last 90 days (and anything upcoming) for duplicate detection.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id, original_filename, media_key, caption, scheduled_at")
    .eq("project_id", post.project_id)
    .gte("created_at", since)
    .neq("id", post.id)
    .limit(500);
  if (error) throw new Error(error.message);
  findings.push(...checkDuplicates({ id: post.id, original_filename: post.original_filename, media_key: post.media_key, caption }, (data ?? []) as PastPost[]));

  return { findings, text: formatFindings(findings) };
}
