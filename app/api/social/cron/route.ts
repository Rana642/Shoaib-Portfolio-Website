import { NextResponse } from "next/server";
import { listDuePosts, markPostResult } from "@/lib/scheduled-posts";
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
 * Called by Vercel Cron (see vercel.json) — protected by CRON_SECRET since
 * this is otherwise an unauthenticated route that publishes to real accounts.
 *
 * Facebook accounts scheduled 10 min-30 days out are usually already handed
 * to Meta's own scheduler as soon as they're captioned (see
 * submitNativeScheduleForPost) — those show up here under
 * `post.result.native` and are excluded from the live publish call below so
 * they don't get posted twice. Instagram has no native scheduling at all, so
 * it always goes through the live call here.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await listDuePosts();
  const results = [];
  let backedOff = false;

  for (const [i, post] of due.entries()) {
    if (i > 0) await sleep(STAGGER_MS);
    const nativeResults = (post.result as { native?: PlatformPostResult[] } | null)?.native ?? [];
    const alreadyHandled = nativeResults.filter((r) => r.ok).map((r) => r.external_id);

    try {
      const imageUrl = await presignDownload(post.media_key);
      const liveResults = await postToAllProjectAccounts(post.project_id, imageUrl, post.caption ?? "", alreadyHandled);
      const allResults = [...nativeResults, ...liveResults];
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
