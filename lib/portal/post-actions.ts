"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, getPortalUser, type PortalContext } from "@/lib/portal/auth";
import type { PortalFeature } from "@/lib/portal/features";
import { getScheduledPost } from "@/lib/scheduled-posts";
import { presignDownload } from "@/lib/storage";
import { changePostCaption, changePostTime, removePost } from "@/lib/planner-post-ops";
import { publishNow, type PublishNowResult } from "@/lib/social-publish-now";
import { markClientActivity, type ClientActivity } from "@/lib/upload-digest";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";
import { plannerDayLabel } from "@/lib/post-review";
import type { Finding } from "@/lib/post-preflight-checks";
import type { ScheduledPost } from "@/lib/dashboard/types";

/**
 * The client portal fixing its own planner (Shoaib, 2026-11-10): edit a
 * caption, move the day/time, delete ("Edit posts"), and publish now
 * ("Publish now"). Every post of the client's projects that hasn't gone out,
 * with the same checks as the dashboard (lib/planner-post-ops.ts). Shoaib
 * hears about each change in the client activity report; a delete is
 * emailed at once, since the post is gone.
 */

const UPCOMING = new Set(["pending_caption", "needs_changes", "scheduled"]);

async function portalPost(postId: string, feature: PortalFeature): Promise<{ ctx: PortalContext; post: ScheduledPost } | { error: string }> {
  if (!z.string().uuid().safeParse(postId).success) return { error: "Post not found." };
  const ctx = await getPortalUser();
  if (!ctx) return { error: "Your session has ended. Sign in again." };
  if (!can(ctx, feature)) return { error: feature === "publish_posts" ? "Publishing isn't switched on for you." : "Editing posts isn't switched on for you." };
  const post = await getScheduledPost(postId);
  if (!post) return { error: "Post not found." };
  const { data: project } = await db.from("client_projects").select("id").eq("id", post.project_id).eq("client_id", ctx.clientId).maybeSingle();
  if (!project || !canSeeProject(ctx, post.project_id)) return { error: "Post not found." };
  return { ctx, post };
}

/** For the activity report. An upload or fix waiting to be reported is kept, so it isn't lost. */
async function note(post: ScheduledPost, ctx: PortalContext, kind: ClientActivity["kind"], what: string) {
  const current = (post as ScheduledPost & { client_activity?: ClientActivity | null }).client_activity;
  if (current && (current.kind === "upload" || current.kind === "fix")) return;
  await markClientActivity([post.id], { at: new Date().toISOString(), by: ctx.user.email ?? "client", kind, note: what });
}

function refresh() {
  revalidatePath("/portal/planner");
  revalidatePath("/portal/stories");
  revalidatePath("/dashboard/social/planner");
}

export async function portalUpdateCaption(postId: string, caption: string): Promise<{ ok: true; findings: Finding[] } | { error: string }> {
  const found = await portalPost(postId, "edit_posts");
  if ("error" in found) return found;
  const parsed = z.string().trim().min(1, "Write a caption.").max(2200).safeParse(caption);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!UPCOMING.has(found.post.status)) return { error: "This post has already gone out." };
  try {
    const { findings } = await changePostCaption(postId, parsed.data);
    await note(found.post, found.ctx, "edit", "caption changed");
    refresh();
    return { ok: true, findings };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the caption." };
  }
}

export async function portalSetPostTime(postId: string, date: string, time: string): Promise<{ ok: true } | { error: string }> {
  const found = await portalPost(postId, "edit_posts");
  if ("error" in found) return found;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: "Pick a valid date and time." };
  try {
    await changePostTime(postId, date, time);
    await note(found.post, found.ctx, "move", `moved to ${date} ${time}`);
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't change the time." };
  }
}

export async function portalDeletePost(postId: string): Promise<{ ok: true } | { error: string }> {
  const found = await portalPost(postId, "edit_posts");
  if ("error" in found) return found;
  const { post, ctx } = found;
  if (!UPCOMING.has(post.status)) return { error: "This post has already gone out, so it isn't removed from here." };
  try {
    await removePost(postId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't delete the post." };
  }
  // The post is gone, so it can't wait for the activity report: Shoaib hears now.
  if (isResendConfigured) {
    const { data: project } = await db.from("client_projects").select("name").eq("id", post.project_id).maybeSingle();
    await resend.emails
      .send({
        from: fromEmail,
        to: toEmail,
        subject: `${project?.name ?? "A client"}: a post was deleted from the portal`,
        text: `${ctx.user.email ?? "A client"} deleted ${post.original_filename} (${plannerDayLabel(post.scheduled_at)}, was ${post.status.replace("_", " ")}) from ${project?.name ?? "their project"} through the client portal.`,
      })
      .catch((e: unknown) => console.error("[portal] delete notify failed:", e));
  }
  refresh();
  return { ok: true };
}

export async function portalPublishNow(postId: string, confirmChecks = false): Promise<PublishNowResult> {
  const found = await portalPost(postId, "publish_posts");
  if ("error" in found) return { status: "error", message: found.error };
  try {
    const res = await publishNow(postId, confirmChecks);
    if (res.status === "published") await note(found.post, found.ctx, "publish", "published now");
    return res;
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't publish the post." };
  } finally {
    refresh();
  }
}

/** Download, for someone who can edit or publish (the file is theirs). */
export async function portalDownloadUrl(postId: string): Promise<{ url: string } | { error: string }> {
  let found = await portalPost(postId, "edit_posts");
  if ("error" in found) found = await portalPost(postId, "publish_posts");
  if ("error" in found) return found;
  if (found.post.status === "posted") return { error: "This post's file was removed after it went out." };
  try {
    return { url: await presignDownload(found.post.media_key, found.post.original_filename || "post", 300) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't get the file." };
  }
}
