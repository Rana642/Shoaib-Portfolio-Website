"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, getPortalUser, type PortalContext } from "@/lib/portal/auth";
import type { PortalFeature } from "@/lib/portal/features";
import { createScheduledPost, dateToScheduledAt, getScheduledPost, pktToScheduledAt, setCaptionAndSchedule } from "@/lib/scheduled-posts";
import { DuplicateMediaError } from "@/lib/media-fingerprint";
import { preflightPost } from "@/lib/post-preflight";
import { presignDownload } from "@/lib/storage";
import { changePostCaption, changePostTime, removePost, replacePostMedia } from "@/lib/planner-post-ops";
import { deleteObject } from "@/lib/storage";
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

/** "Change image": a new picture or video for the post; caption, day/time and platforms stay. */
export async function portalReplacePostFile(postId: string, key: string, name: string): Promise<{ ok: true; notes: string[] } | { error: string }> {
  const found = await portalPost(postId, "edit_posts");
  if ("error" in found) return found;
  if (typeof key !== "string" || typeof name !== "string" || name.length > 300) return { error: "That file couldn't be read." };
  try {
    const { notes } = await replacePostMedia(postId, { key, name });
    await note(found.post, found.ctx, "edit", `image changed (was ${found.post.original_filename})`);
    refresh();
    return { ok: true, notes };
  } catch (error) {
    const { count } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("media_key", key);
    if (!count && key.startsWith(`social/${found.post.project_id}/`)) await deleteObject(key).catch(() => undefined);
    return { error: error instanceof Error ? error.message : "Couldn't change the file." };
  }
}

export type PortalNewPostResult =
  | { status: "scheduled"; postId: string; findings: Finding[] }
  | { status: "published"; postId: string; ok: boolean; note: string | null }
  | { status: "confirm"; postId: string; findings: Finding[] }
  | { status: "blocked"; postId: string; findings: Finding[] }
  | { status: "error"; message: string };

/**
 * The portal's Add post with the client's own caption (Shoaib, 2026-11-10):
 * "Schedule" (Edit posts) or "Publish now" (Publish now), one file at a time.
 * The file is already in storage (portal upload URL). Same checks as the
 * dashboard: a FIX finding leaves it on the planner waiting for a caption;
 * CHECK findings need "Publish anyway" before it goes out now.
 */
export async function portalCreatePost(input: {
  projectId: string;
  file: { key: string; name: string };
  date: string;
  time?: string | null;
  caption: string;
  action: "schedule" | "publish";
}): Promise<PortalNewPostResult> {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      file: z.object({ key: z.string().min(1).max(512), name: z.string().min(1).max(300) }),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
      caption: z.string().trim().min(1, "Write a caption.").max(2200),
      action: z.enum(["schedule", "publish"]),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "That post couldn't be read." };
  const { projectId, file, date, time, caption, action } = parsed.data;
  const ctx = await getPortalUser();
  if (!ctx) return { status: "error", message: "Your session has ended. Sign in again." };
  if (!can(ctx, action === "publish" ? "publish_posts" : "edit_posts")) return { status: "error", message: action === "publish" ? "Publishing isn't switched on for you." : "Scheduling isn't switched on for you." };
  const { data: project } = await db.from("client_projects").select("id").eq("id", projectId).eq("client_id", ctx.clientId).maybeSingle();
  if (!project || !canSeeProject(ctx, projectId)) return { status: "error", message: "That project isn't one of yours." };
  if (!file.key.startsWith(`social/${projectId}/`) || file.key.includes("..")) return { status: "error", message: "That file couldn't be read." };

  const scheduledAt = time ? pktToScheduledAt(date, time) : dateToScheduledAt(date);
  if (action === "schedule" && new Date(scheduledAt).getTime() <= Date.now() + 60_000) {
    await deleteObject(file.key).catch(() => undefined);
    return { status: "error", message: time ? "That time has already passed (Pakistan time). Pick a later time." : "The usual time (10:00 AM) has passed for that day. Pick a time." };
  }

  let postId: string;
  try {
    postId = await createScheduledPost({
      project_id: projectId,
      media_key: file.key,
      original_filename: file.name,
      scheduled_at: scheduledAt,
      ...(time ? { time_manual: true } : {}),
      fromClient: { email: ctx.user.email ?? "client", note: null },
    });
  } catch (error) {
    await deleteObject(file.key).catch(() => undefined);
    return { status: "error", message: error instanceof DuplicateMediaError ? error.message : error instanceof Error ? error.message : "Couldn't add the post." };
  }
  const by = ctx.user.email ?? "client";
  const mark = (what: string) => markClientActivity([postId], { at: new Date().toISOString(), by, kind: "upload", note: what });

  // The checks first, judged for when it goes out; a FIX keeps it off the schedule.
  const { findings } = await preflightPost({ postId, caption, scheduledAt: action === "publish" ? new Date().toISOString() : scheduledAt }).catch(() => ({ findings: [] as Finding[] }));
  const fixes = findings.filter((f) => f.severity === "fix");
  const checks = findings.filter((f) => f.severity !== "fix" && f.code !== "no-caption");
  if (fixes.length) {
    await mark("added, waiting for a caption (the client's caption had a mistake)");
    refresh();
    return { status: "blocked", postId, findings: fixes };
  }

  try {
    if (action === "schedule") {
      await changePostCaption(postId, caption);
      await mark(`added and scheduled by the client for ${date}${time ? ` ${time}` : ""}`);
      refresh();
      return { status: "scheduled", postId, findings: checks };
    }
    if (checks.length) {
      await mark("added, waiting for the client to confirm Publish now");
      refresh();
      return { status: "confirm", postId, findings: checks };
    }
    return await publishWithCaption(postId, caption, by);
  } catch (error) {
    refresh();
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't finish the post." };
  }
}

/** Sets the caption and sends the post out now (checks already passed or confirmed). */
async function publishWithCaption(postId: string, caption: string, by: string): Promise<PortalNewPostResult> {
  // No Facebook draft at Meta first: it would only be cancelled again.
  await setCaptionAndSchedule(postId, caption);
  const res = await publishNow(postId, true);
  await markClientActivity([postId], { at: new Date().toISOString(), by, kind: "upload", note: res.status === "published" ? "added and published now by the client" : "added; Publish now didn't go through" });
  refresh();
  if (res.status === "published") return { status: "published", postId, ok: res.ok, note: res.note };
  // Not out: it mustn't slip out later on the cron either, so it waits for a caption again.
  await db.from("scheduled_posts").update({ status: "pending_caption" }).eq("id", postId).eq("status", "scheduled");
  if (res.status === "error") return { status: "error", message: `${res.message} It waits on the planner.` };
  return { status: res.status, postId, findings: res.findings };
}

/** "Publish anyway" after the CHECK findings of a new post. */
export async function portalConfirmNewPost(postId: string, caption: string): Promise<PortalNewPostResult> {
  const found = await portalPost(postId, "publish_posts");
  if ("error" in found) return { status: "error", message: found.error };
  const parsed = z.string().trim().min(1).max(2200).safeParse(caption);
  if (!parsed.success) return { status: "error", message: "Write a caption." };
  if (found.post.status !== "pending_caption") return { status: "error", message: "This post isn't waiting any more." };
  try {
    return await publishWithCaption(postId, parsed.data, found.ctx.user.email ?? "client");
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't publish the post." };
  }
}
