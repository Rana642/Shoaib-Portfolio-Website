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
 */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await listDuePosts();
  const results = [];
  let backedOff = false;
  let deferred = 0;
  const startedAt = Date.now();

  for (const [i, post] of due.entries()) {
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
    // A story is a photo or a video — told apart by the uploaded file's extension.
    const isVideoFile = /\.(mp4|mov)$/i.test(post.media_key);
    // Natively scheduled on Facebook, or already tried on an earlier run
    // that only waited for Google — never post those again.
    const alreadyHandled = [...nativeResults.filter((r) => r.ok).map((r) => r.external_id), ...priorLive.map((r) => r.external_id)];

    try {
      const targets = post.target_platforms?.length ? post.target_platforms : null;
      // Reels and stories are Facebook/Instagram only — Google Business takes photo posts.
      const gbpLoc = !isReel && !isStory && (!targets || targets.includes(GBP_PLATFORM)) ? await gbpPlannerLocation(post.project_id) : null;
      const socialTargets = targets ? targets.filter((t) => t !== GBP_PLATFORM) : null;

      let liveResults: PlatformPostResult[] = [];
      if (!targets || (socialTargets && socialTargets.length > 0)) {
        const imageUrl = await presignDownload(post.media_key, undefined, isReel || isStory ? 6 * 3600 : 3600);
        const reel =
          isReel || isStory
            ? {
                kind: isStory ? ("story" as const) : ("reel" as const),
                videoUrl: isReel || isVideoFile ? imageUrl : null,
                fbImageUrl: isStory && !isVideoFile ? mintFacebookMediaUrl(post.media_key) : undefined,
                igImageUrl: isStory && !isVideoFile ? mintInstagramMediaUrl(post.media_key) : undefined,
                coverUrl: isReel && post.cover_key ? mintInstagramMediaUrl(post.cover_key) : null,
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
        const done = liveResults.filter((r) => !r.pending);
        const pending = Object.fromEntries(stillProcessing.map((r) => [r.external_id, r.pending!]));
        await db.from("scheduled_posts").update({ result: { native: nativeResults, live: [...priorLive, ...done], pending } }).eq("id", post.id);
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
        // Keep it scheduled; the next run sends only the Google post.
        await db.from("scheduled_posts").update({ result: { native: nativeResults, live } }).eq("id", post.id);
        results.push({ id: post.id, ok: false, waitingForGoogle: true });
        continue;
      }

      const allResults = [...nativeResults, ...live, ...(gbpResult ? [gbpResult] : [])];
      const ok = allResults.length > 0 && allResults.every((r) => r.ok);
      await markPostResult(post.id, ok, { platforms: allResults });
      results.push({ id: post.id, ok, platforms: allResults });

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

  return NextResponse.json({ checked: due.length, processed: results.length, deferred, backedOff, results, instagramTokensRefreshed });
}
