import "server-only";
import { db } from "./dashboard/db";
import { GBP_DAILY_CAP_PER_LOCATION, findLocation, gbpAccessToken, getGbpConnection, getReview, isGbpPaceError, replyToReview } from "./gbp";

/**
 * Review replies written ahead of time (by Claude — in a session, via the
 * gbp_queue_replies MCP tool, or a scheduled Claude task) and sent one at a
 * time by /api/gbp/reply-cron, so they go out like a person working through
 * them by hand (Shoaib, 2026-09-30: "jaisy koi insaan replies ker raha hn
 * manually"). On top of the Google-friendly pacing rule in lib/gbp.ts (5 min
 * gap, 20 per location per day), the sender:
 *   - only works during the day in Pakistan (HUMAN_HOURS_PKT),
 *   - leaves a varied gap between two replies (HUMAN_MIN_GAP_MINUTES plus up
 *     to HUMAN_GAP_JITTER_MINUTES, different after every reply),
 *   - sends at most HUMAN_MAX_REPLIES_PER_DAY per location in any 24 hours,
 *   - sometimes skips a turn (HUMAN_SKIP_CHANCE), so the rhythm isn't a clock,
 *   - re-reads the review first and never overwrites a reply someone already gave.
 * No bursts, whatever the backlog (Shoaib, 2026-10-09: GBP policy, no
 * suspension risk). Same day, after research (no official daily limit; Google
 * screens each reply's content, and every one so far is APPROVED) he asked for
 * more per day: 15–35 min apart, 09:00–23:00, up to 18 a day.
 */

export const HUMAN_HOURS_PKT = { from: 9, to: 23 };
export const HUMAN_MIN_GAP_MINUTES = 15;
export const HUMAN_GAP_JITTER_MINUTES = 20;
export const HUMAN_MAX_REPLIES_PER_DAY = 18;
export const HUMAN_SKIP_CHANCE = 0.2;

/** Minutes to wait after the reply sent at `sentAt`: 15–35, fixed per reply
 *  (seeded by its time, so the cron re-checking every 10 minutes doesn't
 *  re-roll it and drift toward the minimum). */
function requiredGapMinutes(sentAt: string): number {
  let h = 0;
  for (const c of sentAt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUMAN_MIN_GAP_MINUTES + (h % (HUMAN_GAP_JITTER_MINUTES + 1));
}
/** Replies leave this many of a location's daily Google writes for posts —
 *  the day's planner post and any backfilled ones (lib/gbp-backfill.ts). */
export const REPLY_RESERVED_FOR_POSTS = 5;
const MAX_ATTEMPTS = 3;

export type QueueStatus = "draft" | "approved" | "sent" | "skipped" | "failed";

export type QueuedReply = {
  id: string;
  project_id: string;
  location: string;
  review_id: string;
  reviewer: string | null;
  stars: number | null;
  review_comment: string | null;
  review_created_at: string | null;
  reply: string;
  status: QueueStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type QueueInput = {
  reviewId: string;
  reply: string;
  reviewer?: string | null;
  stars?: number | null;
  comment?: string | null;
  created?: string | null;
};

/** Adds or updates replies for one location. Replies already sent are left
 *  alone; waiting ones get the new text/status — or, with onlyNew, every
 *  review that is already in the queue in any state is left alone (for the
 *  scheduled "reply to new reviews" run). */
export async function queueReplies(
  projectId: string,
  location: string,
  items: QueueInput[],
  status: Extract<QueueStatus, "approved" | "draft" | "skipped"> = "approved",
  opts: { onlyNew?: boolean } = {}
): Promise<{ queued: number; unchanged: number }> {
  const clean = items
    .map((i) => ({ ...i, reviewId: i.reviewId.trim(), reply: i.reply.trim() }))
    .filter((i) => i.reviewId && i.reply);
  if (!clean.length) return { queued: 0, unchanged: 0 };
  for (const i of clean) if (i.reply.length > 4096) throw new Error(`The reply for ${i.reviewId} is over 4096 characters.`);

  const { data: existing } = await db
    .from("gbp_reply_queue")
    .select("review_id, status")
    .eq("location", location)
    .in("review_id", clean.map((i) => i.reviewId));
  const done = new Set(
    ((existing ?? []) as { review_id: string; status: QueueStatus }[]).filter((r) => opts.onlyNew || r.status === "sent").map((r) => r.review_id)
  );
  const rows = clean
    .filter((i) => !done.has(i.reviewId))
    .map((i) => ({
      project_id: projectId,
      location,
      review_id: i.reviewId,
      reviewer: i.reviewer ?? null,
      stars: i.stars ?? null,
      review_comment: i.comment ?? null,
      review_created_at: i.created ?? null,
      reply: i.reply,
      status,
      attempts: 0,
      last_error: null,
    }));
  if (rows.length) {
    const { error } = await db.from("gbp_reply_queue").upsert(rows, { onConflict: "location,review_id" });
    if (error) throw new Error(error.message);
  }
  return { queued: rows.length, unchanged: clean.length - rows.length };
}

/** Which of these reviews are already in the queue, and in what state. */
export async function queuedStatuses(location: string, reviewIds: string[]): Promise<Map<string, QueueStatus>> {
  if (!reviewIds.length) return new Map();
  const { data, error } = await db.from("gbp_reply_queue").select("review_id, status").eq("location", location).in("review_id", reviewIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { review_id: string; status: QueueStatus }[]).map((r) => [r.review_id, r.status]));
}

/** Counts per status, plus how many went out in the last 24 hours. */
export async function replyQueueStats(projectId?: string) {
  let q = db.from("gbp_reply_queue").select("status, sent_at");
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const counts: Record<QueueStatus, number> = { draft: 0, approved: 0, sent: 0, skipped: 0, failed: 0 };
  let last24h = 0;
  const since = Date.now() - 24 * 3600 * 1000;
  for (const r of (data ?? []) as { status: QueueStatus; sent_at: string | null }[]) {
    counts[r.status]++;
    if (r.sent_at && new Date(r.sent_at).getTime() >= since) last24h++;
  }
  return { ...counts, sentLast24h: last24h };
}

export async function listQueuedReplies(opts: { projectId?: string; status?: QueueStatus; limit?: number } = {}): Promise<QueuedReply[]> {
  let q = db.from("gbp_reply_queue").select("*");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q
    .order(opts.status === "sent" ? "sent_at" : "review_created_at", { ascending: false, nullsFirst: false })
    .limit(opts.limit ?? 50);
  if (error) throw new Error(error.message);
  return (data ?? []) as QueuedReply[];
}

/** Locations whose replies for today are used up: all Google writes past
 *  the posts' reserve (REPLY_RESERVED_FOR_POSTS), or HUMAN_MAX_REPLIES_PER_DAY
 *  replies in the last 24 hours. */
async function locationsAtReplyLimit(): Promise<string[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: writes }, { data: replies }] = await Promise.all([
    db.from("gbp_write_log").select("location").gte("created_at", since),
    db.from("gbp_reply_queue").select("location").eq("status", "sent").gte("sent_at", since),
  ]);
  const tally = (rows: { location: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.location, (m.get(r.location) ?? 0) + 1);
    return m;
  };
  const full = new Set<string>();
  for (const [l, n] of tally(writes as { location: string }[] | null)) if (n >= GBP_DAILY_CAP_PER_LOCATION - REPLY_RESERVED_FOR_POSTS) full.add(l);
  for (const [l, n] of tally(replies as { location: string }[] | null)) if (n >= HUMAN_MAX_REPLIES_PER_DAY) full.add(l);
  return [...full];
}

/** The reply a person would pick next: complaints first (oldest first),
 *  then everything else newest first. */
async function nextReply(skipLocations: string[] = []): Promise<QueuedReply | null> {
  const pick = async (low: boolean) => {
    let q = db.from("gbp_reply_queue").select("*").eq("status", "approved");
    if (skipLocations.length) q = q.not("location", "in", `(${skipLocations.map((l) => `"${l}"`).join(",")})`);
    q = low ? q.lte("stars", 3).order("review_created_at", { ascending: true }) : q.order("review_created_at", { ascending: false, nullsFirst: false });
    const { data } = await q.limit(1);
    return ((data ?? [])[0] as QueuedReply | undefined) ?? null;
  };
  return (await pick(true)) ?? (await pick(false));
}

const pktHour = (d = new Date()) => (d.getUTCHours() + 5) % 24;

async function markRow(id: string, patch: Partial<QueuedReply>) {
  await db.from("gbp_reply_queue").update(patch).eq("id", id);
}

export type SendResult =
  | { status: "sent" | "skipped" | "failed" | "error"; reviewer: string | null; detail?: string }
  | { status: "idle" | "outside_hours" | "gap" | "resting" | "paced" | "daily_limit"; detail?: string };

/** Sends at most one queued reply, if a person would plausibly send one now. */
export async function sendNextReply(now = new Date()): Promise<SendResult> {
  const hour = pktHour(now);
  if (hour < HUMAN_HOURS_PKT.from || hour >= HUMAN_HOURS_PKT.to) return { status: "outside_hours", detail: `${hour}:00 PKT` };

  const { data: last } = await db.from("gbp_reply_queue").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
  const lastSent = ((last ?? [])[0] as { sent_at: string } | undefined)?.sent_at;
  if (lastSent) {
    const minutes = (now.getTime() - new Date(lastSent).getTime()) / 60000;
    const needed = requiredGapMinutes(lastSent);
    if (minutes < needed) return { status: "gap", detail: `${Math.round(minutes)} of ${needed} min since the last reply` };
  }

  const full = await locationsAtReplyLimit();
  const row = await nextReply(full);
  if (!row) return full.length ? { status: "daily_limit", detail: `${full.length} location(s) at today's reply limit` } : { status: "idle" };
  if (Math.random() < HUMAN_SKIP_CHANCE) return { status: "resting" };

  const conn = await getGbpConnection(row.project_id);
  const loc = conn ? findLocation(conn, row.location) : null;
  if (!loc) {
    await markRow(row.id, { status: "failed", last_error: "The project's Google connection or this location is gone." });
    return { status: "failed", reviewer: row.reviewer, detail: "location not connected" };
  }

  try {
    const token = await gbpAccessToken(row.project_id);
    const review = await getReview(token, loc, row.review_id);
    if (!review) {
      await markRow(row.id, { status: "skipped", last_error: "Review no longer exists." });
      return { status: "skipped", reviewer: row.reviewer, detail: "review gone" };
    }
    if (review.reviewReply?.comment) {
      await markRow(row.id, { status: "skipped", last_error: "Already had a reply." });
      return { status: "skipped", reviewer: row.reviewer, detail: "already replied" };
    }
    await replyToReview(token, loc, row.review_id, row.reply);
    await markRow(row.id, { status: "sent", sent_at: new Date().toISOString(), last_error: null });
    return { status: "sent", reviewer: row.reviewer };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isGbpPaceError(error)) return { status: "paced", detail: message };
    const attempts = row.attempts + 1;
    await markRow(row.id, { attempts, last_error: message, status: attempts >= MAX_ATTEMPTS ? "failed" : "approved" });
    return { status: attempts >= MAX_ATTEMPTS ? "failed" : "error", reviewer: row.reviewer, detail: message };
  }
}
