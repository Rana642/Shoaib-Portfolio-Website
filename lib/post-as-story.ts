import "server-only";
import { db } from "./dashboard/db";
import { copyObject, fetchObject, headObject, uploadObject } from "./storage";
import { storyFrame } from "./story-frame";
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

  const ext = post.media_key.split(".").pop() ?? "jpg";
  // A photo is redrawn as a full 9:16 frame (lib/story-frame.ts) so the
  // Story shows the whole post instead of a zoomed, side-cropped one.
  // Videos are copied as they are; if the redraw fails, the plain copy
  // still goes out.
  let storyKey = `planner/${post.project_id}/post-stories/${post.id}.${ext}`;
  const isPhoto = head.contentType.startsWith("image/") || /^(jpe?g|png|webp)$/i.test(ext);
  let framed = false;
  if (isPhoto) {
    try {
      const { buffer } = await fetchObject(post.media_key);
      storyKey = `planner/${post.project_id}/post-stories/${post.id}.jpg`;
      await uploadObject(storyKey, await storyFrame(buffer), "image/jpeg");
      framed = true;
    } catch {
      storyKey = `planner/${post.project_id}/post-stories/${post.id}.${ext}`;
    }
  }
  if (!framed) await copyObject(post.media_key, storyKey);
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
