import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/dashboard/db";
import { listDuePosts, markPostResult } from "@/lib/scheduled-posts";
import { GBP_PLATFORM, gbpPlannerLocation, isGbpPaceError, publishGbpPhotoPost } from "@/lib/gbp";
import { mintFacebookMediaUrl } from "@/lib/social-facebook-media";
import { postToAllProjectAccounts, type PlatformPostResult, type ReelPending } from "@/lib/social-post";
import { mintInstagramMediaUrl } from "@/lib/social-instagram-media";
import { refreshExpiringInstagramLogins } from "@/lib/social-instagram-login";
import { presignDownload, deleteObject } from "@/lib/storage";
import { syncDueStoryFolders } from "@/lib/story-drive";
import { queueStoryCopy } from "@/lib/post-as-story";
import { restorePublishedMedia } from "@/lib/social-media-restore";
import { watchDriveStories } from "@/lib/story-watchdog";
import { alertHeldPosts, holdLimitMs, HOLD_RETRY_MS, isRateLimited, isRetryable, isWaitingToRetry, type HoldInfo } from "@/lib/social-connection-hold";

// Cron runs every 15 min (vercel.json) but a batch of due posts still fires
// within one invocation — space them out a few seconds apart rather than
// blasting the Graph API all at once. Bot-like burst timing is exactly what
// Meta's anti-spam systems watch for; a real person publishing several
// things back-to-back doesn't hit "send" in the same second for each.
const STAGGER_MS = 4000;
// Meta attaches x-business-use-case-usage / x-page-usage / x-app-usage
// headers reporting % of the rolling rate-limit window consumed — back off
// for the rest of this run once any call reports it's getting close, rather
// than continuing to push and risking a hard block. Whatever's left over
// just waits for the next run 15 minutes later.
const USAGE_BACKOFF_THRESHOLD = 90;
export const maxDuration = 60;
/** Start no new post after this much of the run has passed. */
const RUN_BUDGET_MS = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fires due scheduled_posts (status='scheduled', scheduled_at <= now).
 * Called every 15 minutes by Supabase pg_cron with its own token (SQL in
 * supabase/dashboard-schema.sql — GitHub's schedule fired only every 4–5
 * hours), or by hand from the GitHub Actions workflow with CRON_SECRET —
 * protected either way, since it publishes to real accounts.
 *
 * Facebook accounts scheduled 10 min-30 days out are usually already handed
 * to Meta's own scheduler as soon as they're captioned (see
 * submitNativeScheduleForPost) — those show up here under
 * `post.result.native` and are excluded from the live publish call below so
 * they don't get posted twice. Instagram has no native scheduling at all, so
 * it always goes through the live call here.
 *
 * Google Business (when the project has a connected location and the post
 * targets it) goes out here too, through the Google-friendly pace gate. When
 * the gate says "wait", only the Google part is held back: everything
 * already attempted is saved under result.live, the post stays 'scheduled',
 * and the next run (15 min later) sends just the Google post.
 *
 * When Meta blocks the login itself (a checkpoint, a revoked or expired
 * token), the post is held instead of failed — see lib/social-connection-
 * hold.ts. Held posts wait HOLD_RETRY_MS between tries; one probe per run is
 * enough to know the block is still on, and once it lifts each project gets
 * at most one late post per run so a backlog doesn't land all at once.
 */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = (await listDuePosts()).filter((post) => !isWaitingToRetry(post.result));
  const results = [];
  let backedOff = false;
  let deferred = 0;
  const startedAt = Date.now();
  // A login was refused / an API limit was hit this run: other posts held
  // for the same reason needn't try again yet.
  let metaBlocked = false;
  let rateLimited = false;
  let lastHeldId: string | null = null;
  const lateDoneProjects = new Set<string>();

  for (const [i, post] of due.entries()) {
    const heldBefore = (post.result as { held?: HoldInfo } | null)?.held;
    const sameReasonFailedThisRun = heldBefore?.kind === "rate_limited" ? rateLimited : metaBlocked;
    if (heldBefore && (sameReasonFailedThisRun || lateDoneProjects.has(post.project_id))) continue;
    // Only start another post while there's clearly time to finish it —
    // an Instagram publish can take ~30s. A run cut off at maxDuration in
    // the middle of a post could publish it without recording that, and
    // the next run would publish it again (seen 2026-10-02 with 6 posts due
    // in one run). What's left goes in the next run.
    if (i > 0 && Date.now() - startedAt > RUN_BUDGET_MS) {
      deferred = due.length - i;
      break;
    }
    if (i > 0) await sleep(STAGGER_MS);
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
        results.push({ id: post.id, ok: false, processingReel: true });
        continue;
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
        results.push({ id: post.id, ok: false, waitingForGoogle: true });
        continue;
      }

      // A blocked login or an API limit: hold the post rather than fail it,
      // unless it has already waited too long to still be worth posting.
      // Limits (e.g. LinkedIn's daily quota) clear by themselves — retried
      // quietly, no banner or email.
      const blocked = live.filter(isRetryable);
      if (blocked.length) {
        const onlyLimits = blocked.every(isRateLimited);
        if (onlyLimits) rateLimited = true;
        else metaBlocked = true;
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
          if (!onlyLimits) lastHeldId = post.id;
          results.push({ id: post.id, ok: false, held: true });
          continue;
        }
      }

      const allResults = [...nativeResults, ...live, ...(gbpResult ? [gbpResult] : [])];
      const ok = allResults.length > 0 && allResults.every((r) => r.ok);
      await markPostResult(post.id, ok, { platforms: allResults });
      results.push({ id: post.id, ok, platforms: allResults });
      if (heldBefore) lateDoneProjects.add(post.project_id);

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
      // needed. Deliberately NOT deleted right after native scheduling
      // (published=false): that only guarantees Meta *accepted* the
      // schedule, not that it already fetched the image, so cleanup waits
      // for this confirmed 'posted' outcome instead. Best-effort: a storage
      // failure here must never turn a successful post into a failed one.
      if (ok) {
        for (const key of [post.media_key, post.cover_key].filter((k): k is string => Boolean(k))) {
          try {
            await deleteObject(key);
          } catch {
            /* orphaned object, cleaned up by a future storage audit — not fatal */
          }
        }
      }

      const peakUsage = Math.max(0, ...allResults.map((r) => r.usagePercent ?? 0));
      if (peakUsage >= USAGE_BACKOFF_THRESHOLD) {
        backedOff = true;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPostResult(post.id, false, { error: message });
      results.push({ id: post.id, ok: false, error: message });
    }
  }

  // Tell Shoaib about held posts (at most one email every few hours).
  if (lastHeldId) {
    try {
      await alertHeldPosts(lastHeldId);
    } catch (error) {
      console.error("[social-cron] held-posts alert failed:", error);
    }
  }

  // Instagram-login tokens last 60 days; keep them alive even on projects
  // that rarely post. Best-effort — posting results above are what matter.
  let instagramTokensRefreshed = 0;
  if (!deferred) {
    try {
      instagramTokensRefreshed = await refreshExpiringInstagramLogins();
    } catch {
      /* retried on the next run */
    }
  }

  // Stories from Google Drive folders: import new files, at most once an
  // hour per folder, only when this run has time left after posting.
  let storyFoldersSynced = 0;
  if (!deferred && Date.now() - startedAt < 15_000) {
    try {
      storyFoldersSynced = await syncDueStoryFolders(10_000);
    } catch {
      /* retried on the next run */
    }
  }

  // Drive-fed Stories must not stop unnoticed: email Shoaib when they do.
  let storyAlerts = 0;
  try {
    storyAlerts = await watchDriveStories();
  } catch {
    /* retried on the next run */
  }

  return NextResponse.json({ checked: due.length, processed: results.length, deferred, backedOff, results, instagramTokensRefreshed, storyFoldersSynced, storyAlerts });
}
