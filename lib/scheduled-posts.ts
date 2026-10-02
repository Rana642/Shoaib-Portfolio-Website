import "server-only";
import { db } from "./dashboard/db";
import type { ScheduledPost } from "./dashboard/types";

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

export async function createScheduledPost(input: {
  project_id: string;
  media_key: string;
  original_filename: string;
  scheduled_at: string;
  caption?: string;
  /** null/omitted = every active connected account for the project. */
  target_platforms?: string[] | null;
  /** A client-portal upload: who sent it, and their note. */
  fromClient?: { email: string; note: string | null };
  /** A video Reel (with an optional cover image) or a Story, instead of a
   *  photo post. Stories carry no caption, so they're scheduled right away. */
  reel?: { post_type?: "reel" | "story"; cover_key: string | null };
}): Promise<string> {
  const { data, error } = await db
    .from("scheduled_posts")
    .insert({
      project_id: input.project_id,
      media_key: input.media_key,
      original_filename: input.original_filename,
      scheduled_at: input.scheduled_at,
      caption: input.caption ?? null,
      status: input.caption || input.reel?.post_type === "story" ? "scheduled" : "pending_caption",
      target_platforms: input.target_platforms ?? null,
      // Only sent for portal uploads, so dashboard uploads keep working
      // even before these columns exist.
      ...(input.fromClient ? { uploaded_by_email: input.fromClient.email, client_note: input.fromClient.note } : {}),
      // Only sent for Reels, so photo posts keep working before the
      // post_type/cover_key columns exist.
      ...(input.reel ? { post_type: input.reel.post_type ?? "reel", cover_key: input.reel.cover_key } : {}),
    })
    .select("id")
    .single();
  if (error) {
    if (input.reel && /post_type|cover_key/.test(error.message)) {
      throw new Error("Reels need the database update first (scheduled_posts.post_type / cover_key — see supabase/dashboard-schema.sql).");
    }
    throw new Error(error.message);
  }
  return data.id as string;
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
  const { error } = await db.from("scheduled_posts").update({ result: { native: nativeResults } }).eq("id", id);
  if (error) throw new Error(error.message);
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
  const { data, error } = await db.from("scheduled_posts").select("id, status, scheduled_at").in("id", ids);
  if (error) throw new Error(error.message);
  const rows = new Map(((data ?? []) as { id: string; status: string; scheduled_at: string | null }[]).map((r) => [r.id, r]));
  const changed: string[] = [];
  let slot = 0;
  for (const id of ids) {
    const row = rows.get(id);
    if (!row || row.status === "posted" || row.status === "failed") continue;
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
  const { error } = await db
    .from("scheduled_posts")
    .update({ scheduled_at: dateToScheduledAt(dateStr, prevMinutes) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
