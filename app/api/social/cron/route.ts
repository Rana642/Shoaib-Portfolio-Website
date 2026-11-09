import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { listDuePosts } from "@/lib/scheduled-posts";
import { refreshExpiringInstagramLogins } from "@/lib/social-instagram-login";
import { syncDueStoryFolders } from "@/lib/story-drive";
import { watchDriveStories } from "@/lib/story-watchdog";
import { sendUploadReports } from "@/lib/upload-digest";
import { verifyFacebookPosts } from "@/lib/social-verify";
import { sendMorningReport } from "@/lib/morning-report";
import { alertHeldPosts, isWaitingToRetry } from "@/lib/social-connection-hold";
import { claimPost, newRunState, publishOne, skipHeldThisRun } from "@/lib/social-publish";

// Cron runs every 15 min (vercel.json) but a batch of due posts still fires
// within one invocation — space them out a few seconds apart rather than
// blasting the Graph API all at once. Bot-like burst timing is exactly what
// Meta's anti-spam systems watch for; a real person publishing several
// things back-to-back doesn't hit "send" in the same second for each.
const STAGGER_MS = 4000;
// Back-off when Meta reports its rate window nearly used is decided in
// lib/social-publish.ts; what's left waits for the next run.
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
  // What this run learns (blocked logins, API limits) — shared with every post in it.
  const run = newRunState();

  for (const [i, post] of due.entries()) {
    if (skipHeldThisRun(post, run)) continue;
    // Only start another post while there's clearly time to finish it —
    // an Instagram publish can take ~30s. A run cut off at maxDuration in
    // the middle of a post could publish it without recording that, and
    // the next run would publish it again (seen 2026-10-02 with 6 posts due
    // in one run). What's left goes in the next run.
    if (i > 0 && Date.now() - startedAt > RUN_BUDGET_MS) {
      deferred = due.length - i;
      break;
    }
    // "Publish now" may be sending this one at this moment.
    if (!(await claimPost(post.id))) continue;
    if (i > 0) await sleep(STAGGER_MS);
    const { outcome, backedOff: tooBusy } = await publishOne(post, run);
    results.push(outcome);
    if (tooBusy) {
      backedOff = true;
      break;
    }
  }

  const lastHeldId = run.lastHeldId;
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

  // Client-portal uploads: one report per uploader session, not one per upload.
  let uploadReports = 0;
  try {
    uploadReports = await sendUploadReports();
  } catch {
    /* retried on the next run */
  }

  // Every Facebook post counted as sent is checked on Facebook itself; one
  // that never went live is re-sent and Shoaib is emailed.
  let facebookChecked = 0;
  try {
    facebookChecked = await verifyFacebookPosts(startedAt + 40_000);
  } catch (error) {
    console.error("[social-cron] Facebook check failed:", error);
  }

  // The morning report: once a day from 8 AM PKT.
  let morningReport = false;
  try {
    morningReport = await sendMorningReport();
  } catch (error) {
    console.error("[social-cron] morning report failed:", error);
  }

  return NextResponse.json({ checked: due.length, processed: results.length, deferred, backedOff, results, instagramTokensRefreshed, storyFoldersSynced, storyAlerts, uploadReports, facebookChecked, morningReport });
}
