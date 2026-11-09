import "server-only";
import { db } from "@/lib/dashboard/db";
import type { ScheduledPost } from "@/lib/dashboard/types";
import { markPostResult } from "@/lib/scheduled-posts";
import { GBP_PLATFORM, gbpPlannerLocation, isGbpPaceError, publishGbpPhotoPost } from "@/lib/gbp";
import { mintFacebookMediaUrl } from "@/lib/social-facebook-media";
import { postToAllProjectAccounts, type PlatformPostResult, type ReelPending } from "@/lib/social-post";
import { mintInstagramMediaUrl } from "@/lib/social-instagram-media";
import { presignDownload, deleteObject } from "@/lib/storage";
import { queueStoryCopy } from "@/lib/post-as-story";
import { restorePublishedMedia } from "@/lib/social-media-restore";
import { holdLimitMs, HOLD_RETRY_MS, isRateLimited, isRetryable, type HoldInfo } from "@/lib/social-connection-hold";

// Meta attaches x-business-use-case-usage / x-page-usage / x-app-usage
// headers reporting % of the rolling rate-limit window consumed — back off
// for the rest of a run once any call reports it's getting close.
const USAGE_BACKOFF_THRESHOLD = 90;

// One publish can take ~30 s (an Instagram container); a claim longer than
// that keeps the cron and "Publish now" from sending the same post twice.
const CLAIM_SECONDS = 120;

/** What one run (the cron, or a single "Publish now") learns as it goes. */
export interface RunState {
  // A login was refused / an API limit was hit this run: other posts held
  // for the same reason needn't try again yet. Tracked per account, so one
  // Page's broken login doesn't keep Pages on a working login waiting.
  blockedAccounts: Set<string>;
  rateLimited: boolean;
  lastHeldId: string | null;
  lateDoneProjects: Set<string>;
}

export const newRunState = (): RunState => ({ blockedAccounts: new Set(), rateLimited: false, lastHeldId: null, lateDoneProjects: new Set() });

/**
 * Takes a due post for this caller alone, for CLAIM_SECONDS. Both the cron and
 * "Publish now" claim before publishing, so the same post can't go out twice.
 * Before the claimed_until column exists the caller goes ahead, as before
 * claims existed; any other database error refuses the claim.
 */
export async function claimPost(id: string): Promise<boolean> {
  const now = new Date();
  const { data, error } = await db
    .from("scheduled_posts")
    .update({ claimed_until: new Date(now.getTime() + CLAIM_SECONDS * 1000).toISOString() })
    .eq("id", id)
    .eq("status", "scheduled")
    .or(`claimed_until.is.null,claimed_until.lt.${now.toISOString()}`)
    .select("id");
  if (error) {
    // Only a missing claimed_until column (schema not yet run) means "no claims yet, go ahead".
    // Any other error refuses the claim; the next run tries again.
    if (error.code === "42703" || error.code === "PGRST204") return true;
    console.error("[social-publish] claim failed:", error.code || error.message);
    return false;
  }
  return (data ?? []).length === 1;
}

/** Whether a held post should wait because the same block already hit another post this run. */
export function skipHeldThisRun(post: ScheduledPost, run: RunState): boolean {
  const heldBefore = (post.result as { held?: HoldInfo } | null)?.held;
  if (!heldBefore) return false;
  const sameReasonFailedThisRun =
    heldBefore.kind === "rate_limited" ? run.rateLimited : Boolean(heldBefore.accounts?.length) && heldBefore.accounts.every((a) => run.blockedAccounts.has(a));
  return sameReasonFailedThisRun || run.lateDoneProjects.has(post.project_id);
}

export type PublishOutcome = Record<string, unknown> & { id: string; ok: boolean };

/**
 * Publishes one due post to every platform it hasn't reached yet, and records
 * the result. The body of the cron's loop, shared with "Publish now".
 *
 * Facebook accounts already handed to Meta's own scheduler sit under
 * `result.native` and are left to Meta. Google Business goes through its pace
 * gate; when that says wait, only the Google part waits for the next run. A
 * login Meta blocked holds the post instead of failing it (see
 * lib/social-connection-hold.ts).
 */
export async function publishOne(post: ScheduledPost, run: RunState): Promise<{ outcome: PublishOutcome; backedOff: boolean }> {
  const heldBefore = (post.result as { held?: HoldInfo } | null)?.held;
  const prior = (post.result ?? {}) as {
    native?: PlatformPostResult[];
    live?: PlatformPostResult[];
    gbp?: PlatformPostResult;
    pending?: Record<string, ReelPending>;
  };
  const nativeResults = prior.native ?? [];
  const priorLive = prior.live ?? [];
  const isReel = post.post_type === "reel";
  const isStory = post.post_type === "story";
  const isVideo = post.post_type === "video";
  // A story is a photo or a video — told apart by the uploaded file's extension.
  const isVideoFile = /\.(mp4|mov)$/i.test(post.media_key);
  // Natively scheduled on Facebook, or already tried on an earlier run
  // that only waited for Google — never post those again.
  const alreadyHandled = [...nativeResults.filter((r) => r.ok).map((r) => r.external_id), ...priorLive.map((r) => r.external_id)];

  try {
    const targets = post.target_platforms?.length ? post.target_platforms : null;
    // Google Business takes photo posts only — never Reels, Videos or Stories.
    const gbpLoc = !isReel && !isStory && !isVideo && (!targets || targets.includes(GBP_PLATFORM)) ? await gbpPlannerLocation(post.project_id) : null;
    const socialTargets = targets ? targets.filter((t) => t !== GBP_PLATFORM) : null;

    let liveResults: PlatformPostResult[] = [];
    if (!targets || (socialTargets && socialTargets.length > 0)) {
      // A photo whose upload was already cleared (another row posted the
      // same image) is taken back from that post's Instagram/Facebook copy.
      if (!isReel && !isStory && !isVideo) await restorePublishedMedia(post).catch(() => false);
      const imageUrl = await presignDownload(post.media_key, undefined, isReel || isStory || isVideo ? 6 * 3600 : 3600);
      const reel =
        isReel || isStory || isVideo
          ? {
              kind: isStory ? ("story" as const) : isVideo ? ("video" as const) : ("reel" as const),
              videoUrl: isReel || isVideo || isVideoFile ? imageUrl : null,
              title: post.video_title ?? null,
              privacy: post.video_privacy ?? null,
              fbImageUrl: isStory && !isVideoFile ? mintFacebookMediaUrl(post.media_key) : undefined,
              igImageUrl: isStory && !isVideoFile ? mintInstagramMediaUrl(post.media_key) : undefined,
              coverUrl: (isReel || isVideo) && post.cover_key ? mintInstagramMediaUrl(post.cover_key) : null,
              pending: prior.pending ?? {},
            }
          : undefined;
      liveResults = await postToAllProjectAccounts(post.project_id, imageUrl, post.caption ?? "", post.media_key, alreadyHandled, socialTargets, reel);
      // A Google-only project has no social accounts — that's not a failure.
      if (gbpLoc) liveResults = liveResults.filter((r) => r.platform !== "-");
    }

    // An Instagram Reel still processing: keep what's done, remember the
    // container, and finish it on a later run.
    const stillProcessing = liveResults.filter((r) => r.pending && !r.ok);
    if (stillProcessing.length) {
      // A blocked account isn't "done" — leave it out so it's tried again.
      const done = liveResults.filter((r) => !r.pending && !isRetryable(r));
      const pending = Object.fromEntries(stillProcessing.map((r) => [r.external_id, r.pending!]));
      await db
        .from("scheduled_posts")
        .update({ result: { native: nativeResults, live: [...priorLive, ...done], pending, ...(heldBefore ? { held: heldBefore } : {}) } })
        .eq("id", post.id);
      return { outcome: { id: post.id, ok: false, processingReel: true }, backedOff: false };
    }
    const live = [...priorLive, ...liveResults];

    let gbpResult: PlatformPostResult | undefined = prior.gbp?.ok ? prior.gbp : undefined;
    let gbpWaiting = false;
    if (gbpLoc && !gbpResult) {
      const base = { platform: GBP_PLATFORM, label: gbpLoc.title, external_id: gbpLoc.name };
      try {
        const res = await publishGbpPhotoPost(post.project_id, gbpLoc, post.caption ?? "", mintFacebookMediaUrl(post.media_key));
        gbpResult = { ...base, ok: true, post_id: res.name };
      } catch (error) {
        if (isGbpPaceError(error)) gbpWaiting = true;
        else gbpResult = { ...base, ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    if (gbpWaiting) {
      // Keep it scheduled; the next run sends only the Google post (and
      // tries any blocked Meta account again).
      await db
        .from("scheduled_posts")
        .update({ result: { native: nativeResults, live: live.filter((r) => !isRetryable(r)), ...(heldBefore ? { held: heldBefore } : {}) } })
        .eq("id", post.id);
      return { outcome: { id: post.id, ok: false, waitingForGoogle: true }, backedOff: false };
    }

    // A blocked login or an API limit: hold the post rather than fail it,
    // unless it has already waited too long to still be worth posting.
    // Limits (e.g. LinkedIn's daily quota) clear by themselves — retried
    // quietly, no banner or email.
    const blocked = live.filter(isRetryable);
    if (blocked.length) {
      const onlyLimits = blocked.every(isRateLimited);
      if (onlyLimits) run.rateLimited = true;
      else for (const r of blocked) if (!isRateLimited(r)) run.blockedAccounts.add(r.label);
      const since = heldBefore?.since ?? new Date().toISOString();
      if (Date.now() - new Date(since).getTime() < holdLimitMs(post.post_type)) {
        const held: HoldInfo = {
          since,
          error: blocked[0].error ?? "",
          accounts: blocked.map((r) => r.label),
          next_try: new Date(Date.now() + HOLD_RETRY_MS).toISOString(),
          tries: (heldBefore?.tries ?? 0) + 1,
          ...(heldBefore?.alerted_at ? { alerted_at: heldBefore.alerted_at } : {}),
          ...(onlyLimits ? { kind: "rate_limited" as const } : {}),
        };
        await db
          .from("scheduled_posts")
          .update({
            result: {
              native: nativeResults,
              live: live.filter((r) => !isRetryable(r)),
              ...(gbpResult?.ok ? { gbp: gbpResult } : {}),
              held,
            },
          })
          .eq("id", post.id);
        if (!onlyLimits) run.lastHeldId = post.id;
        return { outcome: { id: post.id, ok: false, held: true }, backedOff: false };
      }
    }

    const allResults = [...nativeResults, ...live, ...(gbpResult ? [gbpResult] : [])];
    const ok = allResults.length > 0 && allResults.every((r) => r.ok);
    await markPostResult(post.id, ok, { platforms: allResults });
    if (heldBefore) run.lateDoneProjects.add(post.project_id);

    // Every published post / Reel / video is shared as a Story too — copied
    // before the original file is deleted below. Best-effort.
    if (allResults.some((r) => r.ok) && post.post_type !== "story") {
      try {
        await queueStoryCopy(post);
      } catch {
        /* the post itself went out; a missing story copy isn't fatal */
      }
    }

    // Once every connected account has confirmed the post live, Meta/IG
    // already hold their own copy — the original in R2 is no longer
    // needed. A natively scheduled Facebook copy isn't confirmed yet: the
    // Facebook check (lib/social-verify.ts) clears the upload once it is.
    // Best-effort: a storage failure must never turn a success into a failure.
    if (ok && !allResults.some((r) => r.platform === "facebook" && r.native)) {
      for (const key of [post.media_key, post.cover_key].filter((k): k is string => Boolean(k))) {
        try {
          await deleteObject(key);
        } catch {
          /* orphaned object, cleaned up by a future storage audit — not fatal */
        }
      }
    }

    const peakUsage = Math.max(0, ...allResults.map((r) => r.usagePercent ?? 0));
    return { outcome: { id: post.id, ok, platforms: allResults }, backedOff: peakUsage >= USAGE_BACKOFF_THRESHOLD };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markPostResult(post.id, false, { error: message });
    return { outcome: { id: post.id, ok: false, error: message }, backedOff: false };
  }
}
