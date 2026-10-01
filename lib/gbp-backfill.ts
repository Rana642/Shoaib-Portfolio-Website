import "server-only";
import { db } from "./dashboard/db";
import { GBP_PLATFORM, GBP_POST_KINDS, gbpPlannerLocation, isGbpPaceError, publishGbpPhotoPost, type GbpLocation } from "./gbp";
import { HUMAN_HOURS_PKT } from "./gbp-replies";
import { decryptAccountToken, listSocialAccountsForProject } from "./social-accounts";
import { mintFacebookMediaUrl } from "./social-facebook-media";
import { publishedImageUrl } from "./social-fb";
import { IG_LOGIN_GRAPH_BASE, getFreshInstagramLoginToken, isInstagramLoginAccount } from "./social-instagram-login";
import type { PlatformPostResult } from "./social-post";
import { deleteObject, fetchObject, uploadObject } from "./storage";

/**
 * Planner posts that went out before a project's Google Business profile was
 * on the Planner (Shoaib, 2026-09-30, Hotel Elegant + Silver Sand: "Day 1 se
 * ab tak wali post GMB per bhi Legal delay k sath"). Each row of
 * gbp_post_backfill is posted once, oldest first, like a person catching up
 * by hand — on top of the Google-friendly pace gate in lib/gbp.ts:
 *   - daytime in Pakistan only (the same hours as review replies),
 *   - at least BACKFILL_GAP_HOURS between two Google posts on one location,
 *     the day's own planner post included, so a profile gets a few a day,
 *   - never while that project's planner post is due (today's goes first),
 *   - sometimes skips a turn.
 * The original upload is usually gone from storage (it is cleared once
 * Facebook and Instagram confirm), so the image is taken back from the
 * Instagram copy (else Facebook) and parked in storage for Google to fetch.
 */

export const BACKFILL_GAP_HOURS = 3;
const BACKFILL_SKIP_CHANCE = 0.3;
const MAX_ATTEMPTS = 3;
/** Google fetches the image after the post is created — parked copies stay
 *  this long before they are cleared. */
const PARK_KEEP_MS = 2 * 3600 * 1000;

type Planner = { scheduled_at: string | null; caption: string | null; media_key: string; result: { platforms?: PlatformPostResult[] } | null };
type Row = {
  post_id: string;
  project_id: string;
  attempts: number;
  media_key: string | null;
  scheduled_posts: Planner | null;
};

export type BackfillResult =
  | { status: "sent" | "failed" | "error"; post: string; detail?: string }
  | { status: "idle" | "outside_hours" | "waiting" | "resting" | "paced"; detail?: string };

const pktHour = (d: Date) => (d.getUTCHours() + 5) % 24;
const HOUR = 3600 * 1000;

async function markRow(postId: string, patch: Record<string, unknown>) {
  await db.from("gbp_post_backfill").update(patch).eq("post_id", postId);
}

/** Clears parked images of rows that are done with them. */
async function clearParked(now: Date) {
  const { data } = await db
    .from("gbp_post_backfill")
    .select("post_id, media_key, status, posted_at")
    .not("media_key", "is", null)
    .neq("status", "waiting");
  for (const r of (data ?? []) as { post_id: string; media_key: string; status: string; posted_at: string | null }[]) {
    if (r.status === "posted" && r.posted_at && now.getTime() - new Date(r.posted_at).getTime() < PARK_KEEP_MS) continue;
    try {
      await deleteObject(r.media_key);
    } catch {
      /* already gone */
    }
    await markRow(r.post_id, { media_key: null });
  }
}

/** When each location last had a Google post (planner or backfill). */
async function lastPostAt(locations: string[]): Promise<Map<string, number>> {
  const { data } = await db
    .from("gbp_write_log")
    .select("location, created_at")
    .in("location", locations)
    .in("kind", [...GBP_POST_KINDS])
    .gte("created_at", new Date(Date.now() - 24 * HOUR).toISOString());
  const last = new Map<string, number>();
  for (const r of (data ?? []) as { location: string; created_at: string }[]) {
    const t = new Date(r.created_at).getTime();
    if (t > (last.get(r.location) ?? 0)) last.set(r.location, t);
  }
  return last;
}

/** Puts the post's image somewhere Google can fetch it; returns its key. */
async function parkImage(row: Row, planner: Planner): Promise<{ key: string; parked: boolean }> {
  if (row.media_key) return { key: row.media_key, parked: true };
  try {
    await fetchObject(planner.media_key);
    return { key: planner.media_key, parked: false };
  } catch {
    /* cleared after posting — take it back from Instagram/Facebook */
  }
  const accounts = await listSocialAccountsForProject(row.project_id);
  const done = (planner.result?.platforms ?? []).filter((p) => p.ok && p.post_id);
  let url: string | null = null;
  for (const platform of ["instagram", "facebook"] as const) {
    const posted = done.find((p) => p.platform === platform);
    const account = posted && accounts.find((a) => a.platform === platform && a.external_id === posted.external_id);
    if (!posted?.post_id || !account) continue;
    try {
      url = isInstagramLoginAccount(account)
        ? await publishedImageUrl(platform, posted.post_id, await getFreshInstagramLoginToken(account), IG_LOGIN_GRAPH_BASE)
        : await publishedImageUrl(platform, posted.post_id, decryptAccountToken(account));
    } catch {
      url = null;
    }
    if (url) break;
  }
  if (!url) throw new Error("The original image is gone from storage and couldn't be fetched back from Instagram or Facebook.");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download the published image (HTTP ${res.status}).`);
  const key = `social/${row.project_id}/gbp-backfill-${row.post_id}.jpg`;
  await uploadObject(key, Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") || "image/jpeg");
  await markRow(row.post_id, { media_key: key });
  return { key, parked: true };
}

/** Posts at most one past planner post to Google, if a person would now. */
export async function sendNextBackfillPost(now = new Date()): Promise<BackfillResult> {
  const hour = pktHour(now);
  if (hour < HUMAN_HOURS_PKT.from || hour >= HUMAN_HOURS_PKT.to) return { status: "outside_hours" };
  await clearParked(now);

  const { data } = await db
    .from("gbp_post_backfill")
    .select("post_id, project_id, attempts, media_key, scheduled_posts(scheduled_at, caption, media_key, result)")
    .eq("status", "waiting")
    .limit(500);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.scheduled_posts);
  if (!rows.length) return { status: "idle" };

  // Today's planner post goes first.
  const { data: due } = await db
    .from("scheduled_posts")
    .select("project_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .gte("scheduled_at", new Date(now.getTime() - 6 * HOUR).toISOString());
  const busy = new Set(((due ?? []) as { project_id: string }[]).map((d) => d.project_id));

  const locs = new Map<string, GbpLocation | null>();
  for (const projectId of new Set(rows.map((r) => r.project_id))) locs.set(projectId, await gbpPlannerLocation(projectId));
  const names = [...locs.values()].filter((l): l is GbpLocation => !!l).map((l) => l.name);
  const last = await lastPostAt(names);

  const eligible = rows.filter((r) => {
    const loc = locs.get(r.project_id);
    return loc && !busy.has(r.project_id) && now.getTime() - (last.get(loc.name) ?? 0) >= BACKFILL_GAP_HOURS * HOUR;
  });
  if (!eligible.length) return { status: "waiting", detail: `${rows.length} left; each profile gets one every ${BACKFILL_GAP_HOURS}h` };

  // The profile that has waited longest, then its oldest post.
  const at = (r: Row) => new Date(r.scheduled_posts!.scheduled_at ?? 0).getTime();
  eligible.sort((a, b) => (last.get(locs.get(a.project_id)!.name) ?? 0) - (last.get(locs.get(b.project_id)!.name) ?? 0) || at(a) - at(b));
  const row = eligible[0];
  if (Math.random() < BACKFILL_SKIP_CHANCE) return { status: "resting" };

  const loc = locs.get(row.project_id)!;
  const planner = row.scheduled_posts!;
  const label = `${loc.title} — ${planner.scheduled_at?.slice(0, 10) ?? row.post_id}`;
  try {
    const { key } = await parkImage(row, planner);
    const res = await publishGbpPhotoPost(row.project_id, loc, planner.caption ?? "", mintFacebookMediaUrl(key), "backfill_post");
    await markRow(row.post_id, { status: "posted", gbp_post: res.name, posted_at: new Date().toISOString(), last_error: null });
    // Show it on the Planner alongside Facebook and Instagram.
    const google: PlatformPostResult & { backfilled: true } = { platform: GBP_PLATFORM, label: loc.title, external_id: loc.name, ok: true, post_id: res.name, backfilled: true };
    const platforms = [...(planner.result?.platforms ?? []).filter((p) => p.platform !== GBP_PLATFORM), google];
    await db.from("scheduled_posts").update({ result: { ...(planner.result ?? {}), platforms } }).eq("id", row.post_id);
    return { status: "sent", post: label };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isGbpPaceError(error)) return { status: "paced", detail: message };
    const attempts = row.attempts + 1;
    await markRow(row.post_id, { attempts, last_error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "waiting" });
    return { status: attempts >= MAX_ATTEMPTS ? "failed" : "error", post: label, detail: message };
  }
}
