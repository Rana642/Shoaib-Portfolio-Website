import "server-only";
import { listSocialAccountsForProject, decryptAccountToken } from "./social-accounts";
import {
  createInstagramReelContainer,
  createInstagramStoryContainer,
  deleteFacebookPost,
  instagramContainerStatus,
  postFacebookPhoto,
  postInstagramPhoto,
  publishFacebookPhotoStory,
  publishFacebookReel,
  publishFacebookVideoStory,
  publishInstagramContainer,
  scheduleFacebookPhoto,
} from "./social-fb";
import { postLinkedInPhoto } from "./social-linkedin";
import { getFreshTikTokAccessToken, publishTikTokPhotoPost, mintTikTokMediaUrl } from "./social-tiktok";
import { mintInstagramMediaUrl } from "./social-instagram-media";
import { mintFacebookMediaUrl } from "./social-facebook-media";
import { IG_LOGIN_GRAPH_BASE, getFreshInstagramLoginToken, isInstagramLoginAccount } from "./social-instagram-login";
import { getScheduledPost, recordNativeScheduleResult } from "./scheduled-posts";
import { presignDownload } from "./storage";
import type { ClientSocialAccount, PostType, ScheduledPost } from "./dashboard/types";

export type PlatformPostResult = {
  platform: string;
  label: string;
  external_id: string;
  ok: boolean;
  post_id?: string;
  error?: string;
  /** true = handed to Meta's own scheduler (published=false), not live yet —
   *  Meta's servers publish it at scheduled_publish_time on their own. */
  native?: boolean;
  usagePercent?: number | null;
  /** An Instagram Reel still being processed: the container to publish on a
   *  later run, and when it was created. */
  pending?: ReelPending;
};

export type ReelPending = { container_id: string; since: string };

/** What a Reel or a Story needs when it's posted: URLs Meta can fetch, and
 *  any Instagram container from an earlier run.
 *  - Reel / video story: `videoUrl` (the original video).
 *  - Photo story: `fbImageUrl` (size-safe proxy) and `igImageUrl` (JPEG proxy). */
export type ReelInput = {
  kind: "reel" | "story";
  videoUrl: string | null;
  fbImageUrl?: string;
  igImageUrl?: string;
  coverUrl: string | null;
  pending: Record<string, ReelPending>;
};

/** Reels and Stories go to Facebook and Instagram; other platforms aren't wired for them yet. */
export const REEL_PLATFORMS = ["facebook", "instagram"];
/** Give up on an Instagram Reel/Story that hasn't finished processing by then. */
const REEL_PROCESSING_LIMIT_MS = 45 * 60 * 1000;

async function postReelToAccount(account: ClientSocialAccount, caption: string, reel: ReelInput): Promise<PlatformPostResult> {
  const base = { platform: account.platform, label: account.label, external_id: account.external_id };
  const what = reel.kind === "story" ? "story" : "Reel";
  try {
    if (account.platform === "facebook") {
      const token = decryptAccountToken(account);
      const r =
        reel.kind === "reel"
          ? await publishFacebookReel(account.external_id, token, reel.videoUrl!, caption)
          : reel.videoUrl
            ? await publishFacebookVideoStory(account.external_id, token, reel.videoUrl)
            : await publishFacebookPhotoStory(account.external_id, token, reel.fbImageUrl!);
      return { ...base, ok: true, post_id: r.post_id, usagePercent: r.usagePercent };
    }
    if (account.platform !== "instagram") return { ...base, ok: false, error: "Reels and stories go to Facebook and Instagram only for now." };

    const viaLogin = isInstagramLoginAccount(account);
    const token = viaLogin ? await getFreshInstagramLoginToken(account) : decryptAccountToken(account);
    const host = viaLogin ? IG_LOGIN_GRAPH_BASE : undefined;
    let pending = reel.pending[account.external_id];
    if (!pending) {
      const containerId =
        reel.kind === "reel"
          ? await createInstagramReelContainer(account.external_id, token, reel.videoUrl!, caption, reel.coverUrl, host)
          : await createInstagramStoryContainer(account.external_id, token, reel.videoUrl ? { videoUrl: reel.videoUrl } : { imageUrl: reel.igImageUrl! }, host);
      pending = { container_id: containerId, since: new Date().toISOString() };
    }
    // Short videos are often ready within seconds — check a few times before
    // leaving it for the next run.
    for (let i = 0; i < 4; i++) {
      const status = await instagramContainerStatus(pending.container_id, token, host);
      if (status.code === "FINISHED") {
        const r = await publishInstagramContainer(account.external_id, token, pending.container_id, host);
        return { ...base, ok: true, post_id: r.post_id, usagePercent: r.usagePercent };
      }
      if (status.code === "ERROR" || status.code === "EXPIRED") {
        return { ...base, ok: false, error: `Instagram couldn't process the ${what} (${status.code.toLowerCase()}${status.detail ? `: ${status.detail}` : ""}).` };
      }
      if (i < 3) await new Promise((r) => setTimeout(r, 3000));
    }
    if (Date.now() - new Date(pending.since).getTime() > REEL_PROCESSING_LIMIT_MS) {
      return { ...base, ok: false, error: `Instagram didn't finish processing the ${what} in 45 minutes.` };
    }
    return { ...base, ok: false, pending };
  } catch (error) {
    return { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const NATIVE_SCHEDULE_MIN_MS = 10 * 60 * 1000; // Meta's own floor
const NATIVE_SCHEDULE_MAX_MS = 30 * 24 * 60 * 60 * 1000; // Meta's own ceiling

/** Whether a target time is far enough out (but not too far) for Meta's own
 *  scheduler to accept it. Outside this window, Facebook falls back to the
 *  cron firing an immediate publish at the right time, same as Instagram. */
export function isWithinNativeScheduleWindow(scheduledAtIso: string): boolean {
  const delta = new Date(scheduledAtIso).getTime() - Date.now();
  return delta >= NATIVE_SCHEDULE_MIN_MS && delta <= NATIVE_SCHEDULE_MAX_MS;
}

async function postToOneAccount(
  account: ClientSocialAccount,
  imageUrl: string,
  caption: string,
  mediaKey: string
): Promise<PlatformPostResult> {
  const base = { platform: account.platform, label: account.label, external_id: account.external_id };
  try {
    let post_id = "";
    let usagePercent: number | null = null;
    if (account.platform === "tiktok") {
      // TikTok's PULL_FROM_URL needs a URL under a verified domain, not the
      // R2 presigned URL every other platform uses here — see
      // mintTikTokMediaUrl. Publishing is also async: this returns once
      // TikTok accepts the post, not once it's fully live (see
      // publishTikTokPhotoPost).
      const token = await getFreshTikTokAccessToken(account);
      const result = await publishTikTokPhotoPost(token, [mintTikTokMediaUrl(mediaKey)], caption);
      if (result.status === "FAILED") throw new Error(result.failReason || "TikTok rejected the post.");
      post_id = result.publish_id;
    } else {
      const token = decryptAccountToken(account);
      if (account.platform === "facebook") {
        // Always the resized JPEG-proxy URL, not the raw R2 imageUrl —
        // Facebook's photo-via-URL endpoint fails large source images with
        // a generic "Invalid parameter" (see lib/social-facebook-media.ts).
        const r = await postFacebookPhoto(account.external_id, token, mintFacebookMediaUrl(mediaKey), caption);
        post_id = r.post_id;
        usagePercent = r.usagePercent;
      } else if (account.platform === "instagram") {
        // Always the JPEG-proxy URL, not the raw R2 imageUrl — Instagram's
        // media container creation rejects PNG outright (see
        // lib/social-instagram-media.ts). Accounts connected through
        // Instagram Login use their own (refreshed) token on graph.instagram.com.
        const r = isInstagramLoginAccount(account)
          ? await postInstagramPhoto(account.external_id, await getFreshInstagramLoginToken(account), mintInstagramMediaUrl(mediaKey), caption, IG_LOGIN_GRAPH_BASE)
          : await postInstagramPhoto(account.external_id, token, mintInstagramMediaUrl(mediaKey), caption);
        post_id = r.post_id;
        usagePercent = r.usagePercent;
      } else if (account.platform === "linkedin") {
        post_id = (await postLinkedInPhoto(account.external_id, token, imageUrl, caption)).post_id;
      }
    }
    return { ...base, ok: true, post_id, usagePercent };
  } catch (error) {
    return { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Posts immediately to every active connected account for the project,
 *  except any already handled (e.g. natively scheduled on Facebook) —
 *  `excludeExternalIds` skips those. No per-post platform selection
 *  (Shoaib's decision: one image goes everywhere that project is
 *  connected). Returns [] (not an error) when every account was already
 *  handled elsewhere; only errors when the project has NO accounts at all. */
export async function postToAllProjectAccounts(
  projectId: string,
  imageUrl: string,
  caption: string,
  mediaKey: string,
  excludeExternalIds: string[] = [],
  /** null/omitted = every active connected account for the project — set
   *  from the Planner's upload modal to restrict a specific post to only
   *  some of a project's connected platforms. */
  targetPlatforms?: string[] | null,
  /** Set for a video Reel instead of a photo post. */
  reel?: ReelInput
): Promise<PlatformPostResult[]> {
  const all = await listSocialAccountsForProject(projectId);
  if (all.length === 0) {
    return [
      { platform: "-", label: "-", external_id: "-", ok: false, error: "This project has no connected social accounts." },
    ];
  }
  let remaining = all.filter((a) => !excludeExternalIds.includes(a.external_id));
  if (targetPlatforms && targetPlatforms.length > 0) {
    remaining = remaining.filter((a) => targetPlatforms.includes(a.platform));
  }
  if (reel) remaining = remaining.filter((a) => REEL_PLATFORMS.includes(a.platform));
  if (remaining.length === 0) return [];
  return Promise.all(remaining.map((a) => (reel ? postReelToAccount(a, caption, reel) : postToOneAccount(a, imageUrl, caption, mediaKey))));
}

/** Hands eligible Facebook accounts to Meta's own scheduler as soon as a
 *  post is captioned — not gated on the cron's due-time check. Meta's
 *  servers do the actual publish later, at scheduled_publish_time, which
 *  reads as native scheduling rather than an app "pushing" a post at the
 *  last second. Instagram has no equivalent (no native scheduling API at
 *  all), so it's never included here — it always waits for the cron. */
export async function submitNativeSchedule(
  projectId: string,
  mediaKey: string,
  caption: string,
  scheduledAtIso: string,
  targetPlatforms?: string[] | null,
  postType?: PostType
): Promise<PlatformPostResult[]> {
  if (!isWithinNativeScheduleWindow(scheduledAtIso)) return [];
  if (targetPlatforms && targetPlatforms.length > 0 && !targetPlatforms.includes("facebook")) return [];
  if (postType === "story") return [];
  const accounts = await listSocialAccountsForProject(projectId);
  const eligible = accounts.filter((a) => a.platform === "facebook");
  if (eligible.length === 0) return [];

  const scheduledUnix = Math.floor(new Date(scheduledAtIso).getTime() / 1000);
  const isReel = postType === "reel";
  // Facebook fetches the video while the Reel is being set up, so a
  // presigned link to the original is enough; photos go through the
  // size-safe JPEG proxy.
  const mediaUrl = isReel ? await presignDownload(mediaKey, undefined, 6 * 3600) : mintFacebookMediaUrl(mediaKey);
  return Promise.all(
    eligible.map(async (a) => {
      const token = decryptAccountToken(a);
      const base = { platform: a.platform, label: a.label, external_id: a.external_id, native: true as const };
      try {
        const { post_id, usagePercent } = isReel
          ? await publishFacebookReel(a.external_id, token, mediaUrl, caption, scheduledUnix)
          : await scheduleFacebookPhoto(a.external_id, token, mediaUrl, caption, scheduledUnix);
        return { ...base, ok: true, post_id, usagePercent };
      } catch (error) {
        return { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}

/** Call right after a post gets a caption (dashboard upload, or the MCP
 *  social_set_caption_and_schedule tool) — fires off native Facebook
 *  scheduling immediately and records the result, without blocking on or
 *  waiting for the cron. Swallows its own errors (falls through silently to
 *  the cron's normal due-time path) since this is a best-effort optimization,
 *  not the only way the post gets published. */
export async function submitNativeScheduleForPost(postId: string): Promise<void> {
  try {
    const post = await getScheduledPost(postId);
    if (!post || !post.caption || !post.scheduled_at) return;
    const results = await submitNativeSchedule(post.project_id, post.media_key, post.caption, post.scheduled_at, post.target_platforms, post.post_type);
    if (results.length > 0) await recordNativeScheduleResult(postId, results);
  } catch {
    /* best-effort — the cron's due-time path still covers this post */
  }
}

/** Deletes any already-submitted Meta native-schedule drafts for a post
 *  (result.native entries that succeeded) — shared by rescheduleNativePosts
 *  (which then resubmits for the new date) and deletePost (which doesn't).
 *  Without this, dragging a post to a new day or deleting it outright would
 *  leave the OLD draft live on Meta's side, which still fires at the
 *  original time — a surprise post on a real client Page. Best-effort: a
 *  delete failure here just leaves a stale unpublished draft, not data loss. */
async function cancelNativeSchedule(post: ScheduledPost): Promise<void> {
  const native = (post.result as { native?: PlatformPostResult[] } | null)?.native ?? [];
  const stillLive = native.filter((r) => r.native && r.ok && r.post_id);
  if (stillLive.length === 0) return;

  const accounts = await listSocialAccountsForProject(post.project_id);
  for (const r of stillLive) {
    const account = accounts.find((a) => a.external_id === r.external_id);
    if (!account || !r.post_id) continue;
    await deleteFacebookPost(r.post_id, decryptAccountToken(account));
  }
}

/** Call after dragging a post to a different day (or otherwise changing its
 *  scheduled_at) — if it was already handed to Meta's scheduler for the OLD
 *  time, that draft has to be deleted and resubmitted for the new time,
 *  otherwise Meta would still fire the old one too (a duplicate post). A
 *  no-op if the post was never natively scheduled — the cron's normal
 *  due-time path already picks up the new date correctly on its own. */
export async function rescheduleNativePosts(scheduledPostId: string): Promise<void> {
  try {
    const post = await getScheduledPost(scheduledPostId);
    if (!post || !post.caption || !post.scheduled_at) return;
    await cancelNativeSchedule(post);

    const results = await submitNativeSchedule(post.project_id, post.media_key, post.caption, post.scheduled_at, post.target_platforms, post.post_type);
    await recordNativeScheduleResult(scheduledPostId, results);
  } catch {
    /* best-effort — worst case a stale draft post sits unpublished on Meta's side */
  }
}

/** Call before removing a post from the planner outright — cancels any
 *  already-submitted Meta native-schedule draft first (see
 *  cancelNativeSchedule), so a deleted post can never still surprise-publish
 *  on Meta's own schedule later. */
export async function cancelPostEverywhere(scheduledPostId: string): Promise<void> {
  try {
    const post = await getScheduledPost(scheduledPostId);
    if (!post) return;
    await cancelNativeSchedule(post);
  } catch {
    /* best-effort — worst case a stale draft post sits unpublished on Meta's side */
  }
}
