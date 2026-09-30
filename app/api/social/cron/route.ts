import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/dashboard/db";
import { listDuePosts, markPostResult } from "@/lib/scheduled-posts";
import { GBP_PLATFORM, gbpPlannerLocation, isGbpPaceError, publishGbpPhotoPost } from "@/lib/gbp";
import { mintFacebookMediaUrl } from "@/lib/social-facebook-media";
import { postToAllProjectAccounts, type PlatformPostResult } from "@/lib/social-post";
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

  for (const [i, post] of due.entries()) {
    if (i > 0) await sleep(STAGGER_MS);
    const prior = (post.result ?? {}) as { native?: PlatformPostResult[]; live?: PlatformPostResult[]; gbp?: PlatformPostResult };
    const nativeResults = prior.native ?? [];
    const priorLive = prior.live ?? [];
    // Natively scheduled on Facebook, or already tried on an earlier run
    // that only waited for Google — never post those again.
    const alreadyHandled = [...nativeResults.filter((r) => r.ok).map((r) => r.external_id), ...priorLive.map((r) => r.external_id)];

    try {
      const targets = post.target_platforms?.length ? post.target_platforms : null;
      const gbpLoc = !targets || targets.includes(GBP_PLATFORM) ? await gbpPlannerLocation(post.project_id) : null;
      const socialTargets = targets ? targets.filter((t) => t !== GBP_PLATFORM) : null;

      let liveResults: PlatformPostResult[] = [];
      if (!targets || (socialTargets && socialTargets.length > 0)) {
        const imageUrl = await presignDownload(post.media_key);
        liveResults = await postToAllProjectAccounts(post.project_id, imageUrl, post.caption ?? "", post.media_key, alreadyHandled, socialTargets);
        // A Google-only project has no social accounts — that's not a failure.
        if (gbpLoc) liveResults = liveResults.filter((r) => r.platform !== "-");
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
        try {
          await deleteObject(post.media_key);
        } catch {
          /* orphaned object, cleaned up by a future storage audit — not fatal */
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

  return NextResponse.json({ checked: due.length, processed: results.length, backedOff, results });
}
