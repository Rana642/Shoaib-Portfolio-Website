import "server-only";
import { db } from "@/lib/dashboard/db";
import { getScheduledPost } from "@/lib/scheduled-posts";
import { preflightPost } from "@/lib/post-preflight";
import type { Finding } from "@/lib/post-preflight-checks";
import { cancelNativeScheduleStrict, type PlatformPostResult } from "@/lib/social-post";
import { alertHeldPosts } from "@/lib/social-connection-hold";
import { claimPost, newRunState, publishOne } from "@/lib/social-publish";

export type PublishNowResult =
  | { status: "published"; ok: boolean; platforms: PlatformPostResult[]; note: string | null }
  | { status: "blocked"; findings: Finding[] }
  | { status: "confirm"; findings: Finding[] }
  | { status: "error"; message: string };

const NOT_READY: Record<string, string> = {
  posted: "This post has already gone out.",
  failed: "This post already failed. Fix it and schedule it again, or ask for a retry.",
  pending_caption: "This post has no caption yet. Add one first.",
  needs_changes: "This post is flagged for changes. Fix or clear it first.",
};

/**
 * Publishes one scheduled post at once, Shoaib's "Publish now" (2026-11-09).
 * The same checks as scheduling run first: a FIX item stops it; CHECK items
 * stop it until confirmed. A Facebook copy already handed to Meta's own
 * scheduler is cancelled first, so it can't go out twice. Then the cron's own
 * publish code runs, under a claim the cron respects.
 */
export async function publishNow(postId: string, confirmChecks = false): Promise<PublishNowResult> {
  const post = await getScheduledPost(postId);
  if (!post) return { status: "error", message: "Post not found." };
  if (post.status !== "scheduled") return { status: "error", message: NOT_READY[post.status] ?? "This post can't be published now." };

  // Checked as going out now, so a late post isn't refused for being late.
  const { findings } = await preflightPost({ postId, scheduledAt: new Date().toISOString() });
  const mustFix = findings.filter((f) => f.severity === "fix" || (f.code === "no-caption" && post.post_type !== "story"));
  if (mustFix.length) return { status: "blocked", findings: mustFix };
  const checks = findings.filter((f) => !mustFix.includes(f));
  if (checks.length && !confirmChecks) return { status: "confirm", findings: checks };

  if (!(await claimPost(postId))) return { status: "error", message: "This post is being published right now. Check again in a minute." };

  // A Facebook draft whose time is still ahead is cancelled and the post goes
  // out live now. One whose time has come is left alone: Meta has published it
  // (or will in a moment), so it counts as done and the Facebook check
  // confirms it. Deleting it would remove a live post.
  const native = ((post.result as { native?: PlatformPostResult[] } | null)?.native ?? []).filter((r) => r.native && r.ok);
  const ahead = Boolean(post.scheduled_at) && new Date(post.scheduled_at!).getTime() > Date.now() + 2 * 60_000;
  if (ahead) {
    if (native.length) {
      try {
        await cancelNativeScheduleStrict(postId);
      } catch (error) {
        await db.from("scheduled_posts").update({ claimed_until: null }).eq("id", postId);
        return { status: "error", message: `Facebook already has this post scheduled and it couldn't be cancelled, so it wasn't published now: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    // Going out now: the planner shows it at this time, and nothing native is left.
    const result = { ...((post.result as Record<string, unknown> | null) ?? {}), native: [] };
    await db.from("scheduled_posts").update({ scheduled_at: new Date().toISOString(), result }).eq("id", postId);
  }

  const fresh = await getScheduledPost(postId);
  if (!fresh) return { status: "error", message: "Post not found." };
  const run = newRunState();
  const { outcome } = await publishOne(fresh, run);
  if (run.lastHeldId) await alertHeldPosts(run.lastHeldId).catch(() => undefined);

  const platforms = (outcome.platforms as PlatformPostResult[] | undefined) ?? [];
  const note = outcome.held
    ? "A login is blocked, so the post is held and will be tried again."
    : outcome.waitingForGoogle
      ? "Sent where it could; Google Business follows on the next run."
      : outcome.processingReel
        ? "Instagram is still processing the video; it finishes on the next run."
        : typeof outcome.error === "string"
          ? outcome.error
          : null;
  return { status: "published", ok: outcome.ok, platforms, note };
}
