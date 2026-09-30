import "server-only";
import { db } from "./dashboard/db";
import { findLocation, gbpAccessToken, getGbpConnection, getReview, isGbpPaceError, replyToReview } from "./gbp";

/**
 * Review replies written ahead of time (by Claude — in a session, via the
 * gbp_queue_replies MCP tool, or a scheduled Claude task) and sent one at a
 * time by /api/gbp/reply-cron, so they go out like a person working through
 * them by hand (Shoaib, 2026-09-30: "jaisy koi insaan replies ker raha hn
 * manually"). On top of the Google-friendly pacing rule in lib/gbp.ts (5 min
 * gap, 20 per location per day), the sender:
 *   - only works during the day in Pakistan (HUMAN_HOURS_PKT),
 *   - leaves at least HUMAN_MIN_GAP_MINUTES between two replies,
 *   - sometimes skips a turn (HUMAN_SKIP_CHANCE), so the rhythm isn't a clock,
 *   - re-reads the review first and never overwrites a reply someone already gave.
 */

export const HUMAN_HOURS_PKT = { from: 10, to: 22 };
export const HUMAN_MIN_GAP_MINUTES = 12;
export const HUMAN_SKIP_CHANCE = 0.3;
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

/** Adds or updates replies for one location. Replies already sent or
 *  skipped are left alone; waiting ones get the new text/status. */
export async function queueReplies(
  projectId: string,
  location: string,
  items: QueueInput[],
  status: Extract<QueueStatus, "approved" | "draft" | "skipped"> = "approved"
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
  const done = new Set(((existing ?? []) as { review_id: string; status: QueueStatus }[]).filter((r) => r.status === "sent").map((r) => r.review_id));
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

/** The reply a person would pick next: complaints first (oldest first),
 *  then everything else newest first. */
async function nextReply(): Promise<QueuedReply | null> {
  const pick = async (low: boolean) => {
    let q = db.from("gbp_reply_queue").select("*").eq("status", "approved");
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
  | { status: "idle" | "outside_hours" | "gap" | "resting" | "paced"; detail?: string };

/** Sends at most one queued reply, if a person would plausibly send one now. */
export async function sendNextReply(now = new Date()): Promise<SendResult> {
  const hour = pktHour(now);
  if (hour < HUMAN_HOURS_PKT.from || hour >= HUMAN_HOURS_PKT.to) return { status: "outside_hours", detail: `${hour}:00 PKT` };

  const { data: last } = await db.from("gbp_reply_queue").select("sent_at").eq("status", "sent").order("sent_at", { ascending: false }).limit(1);
  const lastSent = ((last ?? [])[0] as { sent_at: string } | undefined)?.sent_at;
  if (lastSent) {
    const minutes = (now.getTime() - new Date(lastSent).getTime()) / 60000;
    if (minutes < HUMAN_MIN_GAP_MINUTES) return { status: "gap", detail: `${Math.round(minutes)} min since the last reply` };
  }

  const row = await nextReply();
  if (!row) return { status: "idle" };
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
