import "server-only";
import { db } from "./dashboard/db";
import { copyObject, headObject } from "./storage";
import { listSocialAccountsForProject } from "./social-accounts";
import type { ScheduledPost } from "./dashboard/types";

/**
 * Standing rule (Shoaib, 2026-10-16): every post, Reel and video that goes
 * out — from the dashboard, the client portal, bulk upload or MCP — is also
 * shared as a Story on the project's Facebook Page and Instagram.
 *
 * Called by the social cron right after the post itself is published, so a
 * post that's held, flagged or still waiting for a caption never leaks out
 * as a Story. The media is copied inside R2 first (the cron deletes the
 * post's own file once it's live), and the story row is due at once, so the
 * next cron run (≤ 15 min) posts it through the normal Story path. One
 * story per post (unique story_of_post_id).
 */
const IG_STORY_MAX_BYTES = 100 * 1024 * 1024;

export async function queueStoryCopy(post: ScheduledPost): Promise<"queued" | "skipped"> {
  if ((post.post_type ?? "post") === "story" || post.story_of_post_id) return "skipped";
  const accounts = await listSocialAccountsForProject(post.project_id);
  let platforms = ["facebook", "instagram"].filter((p) => accounts.some((a) => a.platform === p));
  // A post meant only for other platforms (e.g. LinkedIn only) stays off Stories too.
  if (post.target_platforms?.length) platforms = platforms.filter((p) => post.target_platforms!.includes(p));
  if (!platforms.length) return "skipped";

  const { data: existing } = await db.from("scheduled_posts").select("id").eq("story_of_post_id", post.id).maybeSingle();
  if (existing) return "skipped";

  const head = await headObject(post.media_key).catch(() => null);
  if (!head) return "skipped";
  if (head.size > IG_STORY_MAX_BYTES) platforms = platforms.filter((p) => p !== "instagram");
  if (!platforms.length) return "skipped";

  const ext = post.media_key.split(".").pop() ?? "jpg";
  const storyKey = `planner/${post.project_id}/post-stories/${post.id}.${ext}`;
  await copyObject(post.media_key, storyKey);
  const { error } = await db.from("scheduled_posts").insert({
    project_id: post.project_id,
    media_key: storyKey,
    original_filename: `Story · ${post.original_filename}`,
    scheduled_at: new Date().toISOString(),
    caption: null,
    status: "scheduled",
    post_type: "story",
    target_platforms: platforms,
    story_of_post_id: post.id,
  });
  if (error) throw new Error(error.message);
  return "queued";
}
