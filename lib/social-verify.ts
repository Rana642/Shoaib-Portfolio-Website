import "server-only";
import { db } from "./dashboard/db";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { siteUrl } from "./seo";
import { decryptAccountToken, listSocialAccountsForProject } from "./social-accounts";
import { GRAPH_BASE, deleteFacebookPostStrict, postFacebookPhoto, publishFacebookReel } from "./social-fb";
import { mintFacebookMediaUrl } from "./social-facebook-media";
import { restorePublishedMedia } from "./social-media-restore";
import type { PlatformPostResult } from "./social-post";
import { deleteObject, headObject, presignDownload } from "./storage";

/**
 * Every Facebook post the Planner counts as sent is checked on Facebook
 * itself, so a post can never again go missing while the Planner says "ok".
 *
 * Why (2026-10-30): after the 24 Oct login checkpoint, 36 posts handed to
 * Meta's own scheduler sat in the Pages' scheduled list past their time and
 * never published — for up to 6 days, with the Planner showing them as
 * posted. Meta reports nothing when that happens.
 *
 * The social cron runs this every 15 minutes. From 20 minutes after a post's
 * time (for 3 days), each Facebook result is looked up once:
 * - live → marked verified_at; a posted row's upload is cleared only then
 *   (the cron keeps it while a native Facebook post is unconfirmed, so a
 *   stuck Reel can still be re-sent);
 * - still unpublished or gone → the stale draft is cancelled and the post
 *   goes out live now (at most 2 per run), and Shoaib gets one email per run
 *   listing what was re-sent or couldn't be;
 * - the lookup itself fails (login blocked, rate limit) → tried again next
 *   run; after 4 failed lookups it's in the email too.
 */

const GRACE_MS = 20 * 60_000;
const WINDOW_MS = 3 * 24 * 3600_000;
const MAX_RESENDS_PER_RUN = 2;
const ALERT_AFTER_TRIES = 4;

type FbResult = PlatformPostResult & {
  verified_at?: string;
  verify_tries?: number;
  verify_error?: string;
  verify_alerted?: boolean;
  resent?: { from: string; at: string; why: string };
};
type Row = {
  id: string;
  project_id: string;
  status: string;
  post_type: string;
  scheduled_at: string;
  original_filename: string;
  caption: string | null;
  media_key: string;
  cover_key: string | null;
  result: Record<string, unknown> | null;
  project: { name?: string } | null;
};
type Lookup = { state: "live" | "unpublished" | "missing" | "error"; detail?: string };

const RESULT_LISTS = ["platforms", "native", "live"] as const;

const fbEntries = (row: Row): FbResult[] =>
  RESULT_LISTS.flatMap((k) => ((row.result?.[k] as FbResult[] | undefined) ?? []).filter((r) => r.platform === "facebook" && r.ok && r.post_id));

const unverified = (r: FbResult) => !r.verified_at;

async function lookUp(postId: string, pageId: string, isReel: boolean, token: string): Promise<Lookup> {
  const fields = isReel ? "id,published,status" : "id,is_published";
  const res = await fetch(`${GRAPH_BASE}/${postId}?fields=${fields}&access_token=${encodeURIComponent(token)}`);
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    published?: boolean;
    is_published?: boolean;
    status?: { video_status?: string };
    error?: { code?: number; message?: string };
  };
  if (body.error) {
    // #100 "does not exist, cannot be loaded due to missing permissions…" is
    // the same message for a deleted post and for a token that can't read
    // it — only call it missing when the token can still read the Page's
    // posts, so a permission problem never turns into a double post.
    if (body.error.code === 100 && /does not exist|cannot be loaded|Unsupported get request/i.test(body.error.message ?? "")) {
      const page = await fetch(`${GRAPH_BASE}/${pageId}/published_posts?fields=id&limit=1&access_token=${encodeURIComponent(token)}`);
      const pageBody = (await page.json().catch(() => ({}))) as { error?: { message?: string } };
      if (page.ok && !pageBody.error) return { state: "missing" };
      return { state: "error", detail: pageBody.error?.message ?? `the Page can't be read (HTTP ${page.status})` };
    }
    return { state: "error", detail: body.error.message ?? `HTTP ${res.status}` };
  }
  // A Reel Facebook is still processing isn't stuck — look again next run.
  if (isReel && body.status?.video_status === "processing") return { state: "error", detail: "still processing" };
  const published = isReel ? body.published : body.is_published;
  return published === false ? { state: "unpublished" } : { state: "live" };
}

/** Posts the row to this Page live, now. Returns the new post id. */
async function postLiveNow(row: Row, pageId: string, token: string): Promise<string> {
  if (row.post_type === "reel") {
    if (!(await headObject(row.media_key))) throw new Error("the video is no longer in storage — upload it again");
    const videoUrl = await presignDownload(row.media_key, undefined, 6 * 3600);
    return (await publishFacebookReel(pageId, token, videoUrl, row.caption ?? "")).post_id;
  }
  if (!(await restorePublishedMedia(row))) throw new Error("the image is no longer in storage and no published copy was found");
  return (await postFacebookPhoto(pageId, token, mintFacebookMediaUrl(row.media_key), row.caption ?? "")).post_id;
}

/** Writes the updated Facebook entries back into whichever result list held them. */
function withUpdated(row: Row, updated: Map<string, FbResult>): Record<string, unknown> {
  const result = { ...(row.result ?? {}) };
  for (const k of RESULT_LISTS) {
    const list = result[k] as FbResult[] | undefined;
    if (list) result[k] = list.map((r) => (r.platform === "facebook" && r.post_id && updated.has(r.post_id) ? updated.get(r.post_id)! : r));
  }
  return result;
}

/** Runs one pass; stops starting lookups at `deadline` (epoch ms). Returns how many results were checked. */
export async function verifyFacebookPosts(deadline: number): Promise<number> {
  const now = Date.now();
  const { data } = await db
    .from("scheduled_posts")
    .select("id, project_id, status, post_type, scheduled_at, original_filename, caption, media_key, cover_key, result, project:client_projects(name)")
    .in("post_type", ["post", "reel"])
    .in("status", ["posted", "failed", "scheduled"])
    .gte("scheduled_at", new Date(now - WINDOW_MS).toISOString())
    .lte("scheduled_at", new Date(now - GRACE_MS).toISOString())
    .order("scheduled_at", { ascending: true });
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => fbEntries(r).some(unverified));

  const report: string[] = [];
  let checked = 0;
  let resent = 0;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    const accounts = await listSocialAccountsForProject(row.project_id);
    const updated = new Map<string, FbResult>();
    const name = row.project?.name ?? "A project";
    const when = new Date(row.scheduled_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    for (const entry of fbEntries(row).filter(unverified)) {
      const account = accounts.find((a) => a.platform === "facebook" && a.external_id === entry.external_id);
      if (!account) continue;
      const token = decryptAccountToken(account);
      const found = await lookUp(entry.post_id!, account.external_id, row.post_type === "reel", token);
      checked++;

      if (found.state === "live") {
        updated.set(entry.post_id!, { ...entry, verified_at: new Date().toISOString(), verify_error: undefined });
        continue;
      }
      if (found.state === "error") {
        const tries = (entry.verify_tries ?? 0) + 1;
        const alert = tries >= ALERT_AFTER_TRIES && !entry.verify_alerted;
        if (alert) report.push(`• ${name} — ${row.original_filename} (${when}): Facebook can't be checked (${found.detail}). Look at the Page.`);
        updated.set(entry.post_id!, { ...entry, verify_tries: tries, verify_error: found.detail, ...(alert ? { verify_alerted: true } : {}) });
        continue;
      }

      // Not on the Page: cancel the stale draft (so it can't fire later too) and post it now.
      if (resent >= MAX_RESENDS_PER_RUN) continue;
      resent++;
      const why = found.state === "unpublished" ? "stuck unpublished in Meta's scheduler" : "not on the Page";
      try {
        if (found.state === "unpublished") await deleteFacebookPostStrict(entry.post_id!, token);
        const postId = await postLiveNow(row, account.external_id, token);
        updated.set(entry.post_id!, { ...entry, post_id: postId, native: false, verified_at: new Date().toISOString(), resent: { from: entry.post_id!, at: new Date().toISOString(), why } });
        report.push(`• ${name} — ${row.original_filename} (${when}): was ${why}. Posted to Facebook now.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updated.set(entry.post_id!, { ...entry, ok: false, native: false, error: `Facebook never published this (${why}); posting it again failed: ${message}` });
        report.push(`• ${name} — ${row.original_filename} (${when}): was ${why} and could NOT be re-posted: ${message}`);
      }
    }

    if (!updated.size) continue;
    const result = withUpdated(row, updated);
    const nowFailed = row.status === "posted" && [...updated.values()].some((r) => !r.ok);
    await db
      .from("scheduled_posts")
      .update({ result, ...(nowFailed ? { status: "failed" } : {}) })
      .eq("id", row.id);

    // A posted row whose Facebook copies are all confirmed: its upload is no longer needed.
    const after = { ...row, result };
    if (row.status === "posted" && !nowFailed && fbEntries(after).every((r) => r.verified_at)) {
      for (const key of [row.media_key, row.cover_key].filter((k): k is string => Boolean(k))) {
        await deleteObject(key).catch(() => {});
      }
    }
  }

  if (report.length && isResendConfigured) {
    await resend.emails
      .send({
        from: fromEmail,
        to: toEmail,
        subject: `Facebook check: ${report.length} post${report.length === 1 ? "" : "s"} needed attention`,
        text: [
          "The Planner checked its Facebook posts on Facebook itself and found these were not live:",
          "",
          ...report,
          "",
          `Planner: ${siteUrl}/dashboard/social/planner`,
        ].join("\n"),
      })
      .catch(() => {});
  }
  return checked;
}
