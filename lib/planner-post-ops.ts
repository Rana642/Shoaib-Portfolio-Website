import "server-only";
import { db } from "@/lib/dashboard/db";
import { deleteObject, headObject } from "@/lib/storage";
import { DuplicateMediaError, findContentMatch, fingerprintBuffer, fingerprintStored, type Fingerprint } from "@/lib/media-fingerprint";
import { connectedPlatforms, loadStoredMedia, MAX_VIDEO_BYTES } from "@/lib/planner-intake";
import { lengthProblem, takes } from "@/lib/planner-rules";
import type { PostType } from "@/lib/dashboard/types";
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

/**
 * Swaps a post's picture or video and keeps everything else: caption, day and
 * time, platforms (Shoaib, 2026-11-10: "delete k dobara upload kerni perti hai,
 * sath bana caption bhi delete ho jaye ga"). The new file gets the same checks
 * as an upload: the right kind, a video's length per platform, and not the same
 * file as another post. A Facebook copy at Meta is redone with the new file;
 * one whose time is close is left alone, so the swap is refused. A post held
 * for changes goes back to waiting for a caption, as with Replace image.
 */
export async function replacePostMedia(id: string, file: { key: string; name: string }): Promise<{ notes: string[] }> {
  const post = await getScheduledPost(id);
  if (!post) throw new Error("Post not found.");
  if (post.status === "posted" || post.status === "failed") throw new Error("This post has already gone out, so its file can't change.");
  if (!file.key.startsWith(`social/${post.project_id}/`) || file.key.includes("..")) throw new Error("That file couldn't be read.");
  const native = ((post.result as { native?: { ok?: boolean; native?: boolean }[] } | null)?.native ?? []).filter((r) => r.ok && r.native);
  if (native.length && !nativeDraftChangeable(post)) throw new Error("Facebook already has this post and its time is close, so the file can't change now.");

  const head = await headObject(file.key);
  if (!head) throw new Error("The file didn't finish uploading. Please try again.");
  const kind: PostType = post.post_type ?? "post";
  const notes: string[] = [];
  let fp: Fingerprint;
  let video: boolean;
  if (head.size <= MAX_VIDEO_BYTES) {
    // Small enough to read: its real type, a video's length, and its fingerprint.
    const media = await loadStoredMedia(file.key, file.name);
    video = media.video;
    fp = await fingerprintBuffer(media.buffer, media.video, media.seconds);
  } else {
    video = head.contentType.startsWith("video/");
    fp = await fingerprintStored(file.key);
    notes.push("The video is too big to read here, so its length per platform wasn't checked.");
  }
  if (!video && (kind === "reel" || kind === "video")) throw new Error("This post is a video. Choose an MP4 or MOV video.");
  if (video && kind === "post") throw new Error("This post is a picture. Choose a JPG, PNG or WebP image.");
  if (video && fp.seconds !== null) {
    const targets = (post.target_platforms ?? (await connectedPlatforms(post.project_id))).filter((p) => takes(kind, p));
    const tooLong = targets.map((p) => lengthProblem(kind, p, fp.seconds)).filter((m): m is string => Boolean(m));
    if (tooLong.length) throw new Error(tooLong.join(" "));
  }
  const match = await findContentMatch(post.project_id, fp, { story: kind === "story", excludeId: post.id });
  if (match) throw new DuplicateMediaError(match);

  const patch: Record<string, unknown> = {
    media_key: file.key,
    original_filename: file.name,
    media_md5: fp.md5,
    media_phash: fp.phash,
    media_seconds: fp.seconds !== null ? Math.round(fp.seconds * 10) / 10 : null,
    source_drive_id: null,
  };
  if (post.status === "needs_changes") Object.assign(patch, { status: "pending_caption", review_note: null, review_flagged_at: null });
  const { error } = await db.from("scheduled_posts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  // The Facebook copy at Meta goes out with the new file too.
  if (post.status === "scheduled" && post.caption && native.length) await rescheduleNativePosts(id);
  // The old file is removed unless another post (a Story made from it) still uses it.
  const { count } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("media_key", post.media_key);
  if (!count) await deleteObject(post.media_key).catch(() => undefined);
  return { notes };
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
