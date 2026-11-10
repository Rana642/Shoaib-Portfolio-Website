import "server-only";
import { db } from "./dashboard/db";
import type { ScheduledPost } from "./dashboard/types";
import { DuplicateMediaError, findContentMatch, fingerprintStored, type Fingerprint } from "./media-fingerprint";

// Default time-of-day for a planner post that only specifies a date, in
// Pakistan time (UTC+5) converted to the UTC hour Vercel Cron runs in.
const DEFAULT_POST_HOUR_UTC = 5; // 10:00 AM PKT

/** Combines a plain "YYYY-MM-DD" (from the planner calendar's clicked day)
 *  with the default post time into an ISO timestamp. `offsetMinutes` spaces
 *  out multiple posts added to the same day so they don't collide. */
export function dateToScheduledAt(dateStr: string, offsetMinutes = 0): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, DEFAULT_POST_HOUR_UTC, offsetMinutes, 0));
  return date.toISOString();
}

/** A date plus a time of day typed in Pakistan time ("HH:MM") → the UTC ISO
 *  timestamp. Asia/Karachi has no DST, so it is always exactly UTC+5. */
export function pktToScheduledAt(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 5, mm, 0)).toISOString();
}

export async function createScheduledPost(input: {
  project_id: string;
  media_key: string;
  original_filename: string;
  scheduled_at: string;
  /** The time was typed by hand: drag keeps it and reorder leaves it alone. */
  time_manual?: boolean;
  caption?: string;
  /** null/omitted = every active connected account for the project. */
  target_platforms?: string[] | null;
  /** A client-portal upload: who sent it, and their note. */
  fromClient?: { email: string; note: string | null };
  /** A video Reel (with an optional cover image) or a Story, instead of a
   *  photo post. Stories carry no caption, so they're scheduled right away. */
  reel?: { post_type?: "reel" | "story" | "video"; cover_key: string | null; video_title?: string | null; video_privacy?: string | null };
  /** What the file is, when the caller already has its bytes; otherwise read from storage. */
  fingerprint?: Fingerprint | null;
  /** The Google Drive file it was imported from. */
  source_drive_id?: string | null;
}): Promise<string> {
  // Duplicates by content, never by name (2026-11-09): the same file already on
  // the planner, or posted in the last 90 days, is refused.
  const fp = input.fingerprint ?? (await fingerprintStored(input.media_key).catch(() => null));
  if (fp?.md5) {
    const match = await findContentMatch(input.project_id, fp, { story: input.reel?.post_type === "story" });
    if (match) throw new DuplicateMediaError(match);
  }
  const extra = {
    ...(fp?.md5 ? { media_md5: fp.md5 } : {}),
    ...(fp?.phash ? { media_phash: fp.phash } : {}),
    ...(fp?.seconds != null ? { media_seconds: Math.round(fp.seconds * 10) / 10 } : {}),
    ...(input.source_drive_id ? { source_drive_id: input.source_drive_id } : {}),
  };
  const insert = (withExtra: boolean) => db
    .from("scheduled_posts")
    .insert({
      ...(withExtra ? extra : {}),
      project_id: input.project_id,
      media_key: input.media_key,
      original_filename: input.original_filename,
      scheduled_at: input.scheduled_at,
      caption: input.caption ?? null,
      status: input.caption || input.reel?.post_type === "story" ? "scheduled" : "pending_caption",
      target_platforms: input.target_platforms ?? null,
      ...(input.time_manual ? { time_manual: true } : {}),
      // Only sent for portal uploads, so dashboard uploads keep working
      // even before these columns exist.
      ...(input.fromClient ? { uploaded_by_email: input.fromClient.email, client_note: input.fromClient.note } : {}),
      // Only sent for Reels, so photo posts keep working before the
      // post_type/cover_key columns exist.
      ...(input.reel ? { post_type: input.reel.post_type ?? "reel", cover_key: input.reel.cover_key } : {}),
      ...(input.reel?.video_title ? { video_title: input.reel.video_title } : {}),
      ...(input.reel?.video_privacy ? { video_privacy: input.reel.video_privacy } : {}),
    })
    .select("id")
    .single();
  let { data, error } = await insert(true);
  // Before the fingerprint columns exist: the post itself still saves.
  if (error && Object.keys(extra).length && /media_md5|media_phash|media_seconds|source_drive_id/.test(error.message)) ({ data, error } = await insert(false));
  if (error || !data) {
    if (!error) throw new Error("The post wasn't saved.");
    if (input.reel && /post_type|cover_key/.test(error.message)) {
      throw new Error("Reels need the database update first (scheduled_posts.post_type / cover_key — see supabase/dashboard-schema.sql).");
    }
    throw new Error(error.message);
  }
  return data.id as string;
}

/** How many posts are held, waiting for the uploader to fix them. */
export async function countPostsNeedingChanges(): Promise<number> {
  const { count, error } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "needs_changes");
  // Before the "needs changes" database update there are none.
  if (error) return 0;
  return count ?? 0;
}

export async function listPendingCaptionPosts(): Promise<ScheduledPost[]> {
  const { data, error } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("status", "pending_caption")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledPost[];
}

export async function listScheduledPosts(projectId?: string): Promise<ScheduledPost[]> {
  let query = db.from("scheduled_posts").select("*").order("scheduled_at", { ascending: true, nullsFirst: true });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledPost[];
}

export async function getScheduledPost(id: string): Promise<ScheduledPost | null> {
  const { data, error } = await db.from("scheduled_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScheduledPost) ?? null;
}

export async function setCaptionAndSchedule(id: string, caption: string, scheduledAt?: string) {
  // A post held for changes waits for the uploader's replacement (or for
  // the flag to be cleared) — it must not slip out with the mistake.
  const { data: current, error: readErr } = await db.from("scheduled_posts").select("*").eq("id", id).maybeSingle(); // "*": works before review_note exists
  if (readErr) throw new Error(readErr.message);
  if (current?.status === "needs_changes") {
    throw new Error(`This post is held for changes (${current.review_note ?? "see the Planner"}). Wait for the uploader's new image, or clear the flag first.`);
  }
  const patch: { caption: string; status: "scheduled"; scheduled_at?: string } = {
    caption,
    status: "scheduled",
  };
  if (scheduledAt) patch.scheduled_at = scheduledAt;
  const { error } = await db.from("scheduled_posts").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Records the outcome of handing eligible accounts to Meta's own scheduler
 *  right after captioning — merged under `result.native` while status stays
 *  'scheduled' (the cron still owns whatever's left, e.g. Instagram, and
 *  flips status once that's done too). */
export async function recordNativeScheduleResult(id: string, nativeResults: unknown) {
  // Merged, not replaced: live, pending, gbp or held from an earlier run must survive.
  const { data, error: readErr } = await db.from("scheduled_posts").select("result").eq("id", id).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  const current = (data?.result as Record<string, unknown> | null) ?? {};
  const { error } = await db.from("scheduled_posts").update({ result: { ...current, native: nativeResults } }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Whether a post's Facebook draft at Meta can still be redone: its time is
 *  clearly ahead and nothing has gone out for it yet. Otherwise a redo could
 *  delete a Facebook post that is already live, or post the rest again. */
export function nativeDraftChangeable(post: ScheduledPost): boolean {
  const ahead = Boolean(post.scheduled_at) && new Date(post.scheduled_at!).getTime() > Date.now() + 2 * 60_000;
  const result = (post.result as { live?: unknown[]; pending?: Record<string, unknown>; gbp?: unknown; held?: unknown } | null) ?? {};
  const started = Boolean(result.live?.length) || Object.keys(result.pending ?? {}).length > 0 || Boolean(result.gbp) || Boolean(result.held);
  return ahead && !started;
}

export async function listDuePosts(): Promise<ScheduledPost[]> {
  const { data, error } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    // A day's posts go out in the order set on the Planner.
    .order("scheduled_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledPost[];
}

export async function markPostResult(id: string, ok: boolean, result: unknown) {
  const { error } = await db
    .from("scheduled_posts")
    .update({
      status: ok ? "posted" : "failed",
      result: result as Record<string, unknown>,
      posted_at: ok ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteScheduledPost(id: string) {
  const { error } = await db.from("scheduled_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Moves a post to a different day — e.g. dragging it on the planner
 *  calendar, or fixing a bulk auto-fill guess (a "Friday post" that landed
 *  on the wrong day). Keeps the existing time-of-day offset within the day
 *  so drag-and-drop reordering within a busy day stays stable. */
/** Sets the order of a day's posts (Planner drag up/down within a day, or a
 *  drop onto a card of another day): the given order becomes 10:00, 10:05,
 *  10:10… PKT on that date, the same spacing new posts on one day get.
 *  Published (or failed) posts keep their time. Returns the ids whose time
 *  actually changed. */
export async function reorderPostsOnDay(dateStr: string, ids: string[]): Promise<string[]> {
  const { data, error } = await db.from("scheduled_posts").select("id, status, scheduled_at, time_manual").in("id", ids);
  if (error) throw new Error(error.message);
  const rows = new Map(
    ((data ?? []) as { id: string; status: string; scheduled_at: string | null; time_manual: boolean | null }[]).map((r) => [r.id, r]),
  );
  const changed: string[] = [];
  let slot = 0;
  for (const id of ids) {
    const row = rows.get(id);
    if (!row || row.status === "posted" || row.status === "failed") continue;
    // A time set by hand is never re-spaced: it only follows its post to this day.
    if (row.time_manual && row.scheduled_at) {
      const t = new Date(row.scheduled_at);
      const [y, m, d] = dateStr.split("-").map(Number);
      const keep = new Date(Date.UTC(y, m - 1, d, t.getUTCHours(), t.getUTCMinutes(), 0)).toISOString();
      if (keep !== new Date(row.scheduled_at).toISOString()) {
        const { error: upErr } = await db.from("scheduled_posts").update({ scheduled_at: keep }).eq("id", id);
        if (upErr) throw new Error(upErr.message);
        changed.push(id);
      }
      continue;
    }
    const at = dateToScheduledAt(dateStr, slot * 5);
    slot++;
    if (row.scheduled_at && new Date(row.scheduled_at).getTime() === new Date(at).getTime()) continue;
    const { error: upErr } = await db.from("scheduled_posts").update({ scheduled_at: at }).eq("id", id);
    if (upErr) throw new Error(upErr.message);
    changed.push(id);
  }
  return changed;
}

export async function rescheduleScheduledPost(id: string, dateStr: string) {
  const existing = await getScheduledPost(id);
  const prevMinutes = existing?.scheduled_at ? new Date(existing.scheduled_at).getUTCMinutes() : 0;
  let scheduledAt = dateToScheduledAt(dateStr, prevMinutes);
  // A time set by hand keeps its hour and minute when the post moves to another day.
  if (existing?.time_manual && existing.scheduled_at) {
    const t = new Date(existing.scheduled_at);
    const [y, m, d] = dateStr.split("-").map(Number);
    scheduledAt = new Date(Date.UTC(y, m - 1, d, t.getUTCHours(), t.getUTCMinutes(), 0)).toISOString();
  }
  const { error } = await db.from("scheduled_posts").update({ scheduled_at: scheduledAt }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Sets a post's date AND time by hand (Planner time picker). The time is in
 *  Pakistan time; the post is then flagged so drag and reorder keep it. */
export async function setPostSchedule(id: string, dateStr: string, timeStr: string) {
  const { error } = await db
    .from("scheduled_posts")
    .update({ scheduled_at: pktToScheduledAt(dateStr, timeStr), time_manual: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
