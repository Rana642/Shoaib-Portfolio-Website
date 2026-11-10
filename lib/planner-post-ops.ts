import "server-only";
import { deleteObject } from "@/lib/storage";
import { deleteScheduledPost, getScheduledPost, nativeDraftChangeable, pktToScheduledAt, setCaptionAndSchedule, setPostSchedule } from "@/lib/scheduled-posts";
import { cancelPostEverywhere, rescheduleNativePosts, submitNativeScheduleForPost } from "@/lib/social-post";
import { preflightPost } from "@/lib/post-preflight";
import type { Finding } from "@/lib/post-preflight-checks";

/**
 * Changing one Planner post, shared by the dashboard (admin) and the client
 * portal (Edit posts), so both run exactly the same checks and keep a
 * Facebook copy at Meta in step.
 */

/** Saves a caption; a Facebook draft is redone only while its time is ahead and nothing has gone out. */
export async function changePostCaption(id: string, caption: string): Promise<{ findings: Finding[] }> {
  const post = await getScheduledPost(id);
  if (!post) throw new Error("Post not found.");
  if (post.status === "posted" || post.status === "failed") throw new Error("This post is already out; its caption can't change here.");
  const hadNative = Boolean((post.result as { native?: unknown[] } | null)?.native?.length);
  await setCaptionAndSchedule(id, caption);
  if (nativeDraftChangeable(post)) {
    if (hadNative) await rescheduleNativePosts(id);
    else await submitNativeScheduleForPost(id);
  }
  const { findings } = await preflightPost({ postId: id }).catch(() => ({ findings: [] as Finding[] }));
  return { findings };
}

/** Sets a post's date and time (Pakistan time). It must be ahead, and the post not out yet. */
export async function changePostTime(id: string, date: string, time: string): Promise<void> {
  const post = await getScheduledPost(id);
  if (!post) throw new Error("Post not found.");
  if (post.status === "posted" || post.status === "failed") throw new Error("This post is already out; its time can't change.");
  if (new Date(pktToScheduledAt(date, time)).getTime() <= Date.now()) throw new Error("That date and time has already passed (Pakistan time). Pick a later time.");
  await setPostSchedule(id, date, time);
  // A post already handed to Meta's scheduler needs its draft redone for the new time.
  await rescheduleNativePosts(id);
}

/** Removes a post: its Facebook draft first, so it can never still go out, then its files and the post. */
export async function removePost(id: string): Promise<void> {
  const post = await getScheduledPost(id);
  await cancelPostEverywhere(id);
  if (post) {
    for (const key of [post.media_key, post.cover_key].filter((k): k is string => Boolean(k))) {
      await deleteObject(key).catch(() => undefined);
    }
  }
  await deleteScheduledPost(id);
}
