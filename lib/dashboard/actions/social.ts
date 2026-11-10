"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAdminUser } from "../auth";
import {
  connectFacebookAccount,
  disconnectFacebookLogin,
  facebookPageChoices,
  saveFacebookPageMappings,
  connectLinkedInAccount,
  rediscoverLinkedInOrganizations,
  saveLinkedInOrgMappings,
  addManualSocialAccount,
  removeSocialAccount,
} from "../../social-accounts";
import {
  createScheduledPost,
  getScheduledPost,
  dateToScheduledAt,
  pktToScheduledAt,
  reorderPostsOnDay,
  rescheduleScheduledPost,
} from "../../scheduled-posts";
import { publishNow, type PublishNowResult } from "../../social-publish-now";
import type { Finding } from "../../post-preflight-checks";
import { presignDownload, uploadObject } from "../../storage";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { changePostCaption, changePostTime, removePost, replacePostMedia } from "../../planner-post-ops";
import { loadMedia } from "../../planner-intake";
import { checkDriveFolder, importDriveFile, verifyDriveImport, type DriveFolderCheck, type DriveImportCheck } from "../../planner-drive";
import { describeMatch, DuplicateMediaError, findContentMatch, fingerprintBuffer } from "../../media-fingerprint";
import { applyAuditAction, auditPlanner, fixSafeAuditItems, type AuditAction, type AuditResult } from "../../planner-audit";
import { submitNativeScheduleForPost, rescheduleNativePosts } from "../../social-post";
import { deleteObject } from "../../storage";
import { clearPostFlag } from "../../post-review";
import { toPageChoice } from "../../social-fb";
import type { DiscoveredOrganization } from "../../social-linkedin";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

export async function connectFacebook(formData: FormData) {
  await assertAuthed();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste a User Access Token first." };
  try {
    const pages = await connectFacebookAccount(token);
    return { ok: true, pages: pages.map(toPageChoice) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't connect to Facebook." };
  }
}

export async function removeSecondFacebookLogin() {
  await assertAuthed();
  try {
    await disconnectFacebookLogin(2);
    revalidatePath("/dashboard/social");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't remove the second Facebook login." };
  }
}

export async function refreshFacebookPages() {
  await assertAuthed();
  try {
    // Each Page with the logins that reach it and, once imported, the login
    // its token came from — no tokens (see facebookPageChoices).
    return { ok: true, pages: await facebookPageChoices() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't refresh pages." };
  }
}

// Page ids (and the chosen login's slot) only — the server re-discovers each
// Page and its token, and checks the Page is reachable through that login.
const mappingSchema = z
  .array(
    z.object({
      project_id: z.string().uuid(),
      page_id: z.string().regex(/^\d{1,30}$/),
      login_slot: z.union([z.literal(1), z.literal(2)]).optional(),
    })
  )
  .max(200);

export async function saveMappings(mappingsJson: string) {
  await assertAuthed();
  let mappings;
  try {
    mappings = mappingSchema.parse(JSON.parse(mappingsJson));
  } catch {
    return { error: "Invalid mapping data." };
  }
  try {
    await saveFacebookPageMappings(mappings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the mapping." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

export async function connectLinkedIn(formData: FormData) {
  await assertAuthed();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "Paste a member access token first." };
  try {
    const orgs = await connectLinkedInAccount(token);
    return { ok: true, orgs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't connect to LinkedIn." };
  }
}

export async function refreshLinkedInOrgs() {
  await assertAuthed();
  try {
    const orgs = await rediscoverLinkedInOrganizations();
    return { ok: true, orgs };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't refresh Pages." };
  }
}

const linkedinMappingSchema = z.array(
  z.object({ project_id: z.string().uuid(), org: z.custom<DiscoveredOrganization>() })
);

export async function saveLinkedInMappings(mappingsJson: string) {
  await assertAuthed();
  let mappings;
  try {
    mappings = linkedinMappingSchema.parse(JSON.parse(mappingsJson));
  } catch {
    return { error: "Invalid mapping data." };
  }
  try {
    await saveLinkedInOrgMappings(mappings);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the mapping." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

const manualAccountSchema = z.object({
  project_id: z.string().uuid(),
  platform: z.enum(["facebook", "instagram", "linkedin"]),
  label: z.string().min(1).max(200),
  external_id: z.string().min(1).max(200),
  access_token: z.string().min(1),
});

export async function addManualAccount(formData: FormData) {
  await assertAuthed();
  const parsed = manualAccountSchema.safeParse({
    project_id: formData.get("project_id"),
    platform: formData.get("platform"),
    label: formData.get("label"),
    external_id: formData.get("external_id"),
    access_token: formData.get("access_token"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await addManualSocialAccount(parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the account." };
  }
  revalidatePath("/dashboard/social");
  return { ok: true };
}

export async function removeAccount(id: string) {
  await assertAuthed();
  await removeSocialAccount(id);
  revalidatePath("/dashboard/social");
}

const plannerUploadSchema = z.object({
  project_id: z.string().uuid(),
  media_key: z.string().min(1),
  original_filename: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  // Optional time of day typed by hand, in Pakistan time ("HH:MM"). Omitted = the default slot.
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time as HH:MM").optional(),
  offset_minutes: z.coerce.number().int().min(0).max(1000).default(0),
  caption: z.string().max(2200).optional(),
  // JSON-encoded string[] of platforms to target, or omitted for "all
  // connected accounts" (the original, still-default behavior).
  platforms: z.string().optional(),
  // A video Reel instead of a photo post, with an optional cover image.
  post_type: z.enum(["post", "reel", "story", "video"]).default("post"),
  cover_key: z.string().min(1).optional(),
  // YouTube's title (max 100) and, for a Video, its privacy.
  video_title: z.string().trim().max(100).optional(),
  video_privacy: z.enum(["public", "unlisted", "private"]).optional(),
});

/** Creates one planner post for the day the user clicked on the calendar —
 *  offset_minutes lets a batch of same-day uploads not collide on the exact
 *  same scheduled_at. */
export async function createPlannerPost(formData: FormData) {
  await assertAuthed();
  const parsed = plannerUploadSchema.safeParse({
    project_id: formData.get("project_id"),
    media_key: formData.get("media_key"),
    original_filename: formData.get("original_filename"),
    date: formData.get("date"),
    time: formData.get("time") || undefined,
    offset_minutes: formData.get("offset_minutes") ?? 0,
    caption: formData.get("caption") || undefined,
    platforms: formData.get("platforms") || undefined,
    post_type: formData.get("post_type") || undefined,
    cover_key: formData.get("cover_key") || undefined,
    video_title: formData.get("video_title") || undefined,
    video_privacy: formData.get("video_privacy") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let targetPlatforms: string[] | null = null;
  if (parsed.data.platforms) {
    try {
      const arr = JSON.parse(parsed.data.platforms);
      if (Array.isArray(arr) && arr.every((p) => typeof p === "string")) targetPlatforms = arr;
    } catch {
      return { error: "Invalid platforms selection." };
    }
  }

  // A time typed by hand must be in the future: a past time would be picked up by the next cron run at once.
  if (parsed.data.time && new Date(pktToScheduledAt(parsed.data.date, parsed.data.time)).getTime() <= Date.now()) {
    return { error: "That date and time has already passed (Pakistan time). Pick a later time." };
  }

  let postId: string;
  try {
    postId = await createScheduledPost({
      project_id: parsed.data.project_id,
      media_key: parsed.data.media_key,
      original_filename: parsed.data.original_filename,
      scheduled_at: parsed.data.time
        ? pktToScheduledAt(parsed.data.date, parsed.data.time)
        : dateToScheduledAt(parsed.data.date, parsed.data.offset_minutes),
      ...(parsed.data.time ? { time_manual: true } : {}),
      caption: parsed.data.caption,
      target_platforms: targetPlatforms,
      ...(parsed.data.post_type !== "post"
        ? {
            reel: {
              post_type: parsed.data.post_type,
              cover_key: parsed.data.post_type === "story" ? null : parsed.data.cover_key ?? null,
              video_title: parsed.data.post_type === "story" ? null : parsed.data.video_title ?? null,
              video_privacy: parsed.data.post_type === "video" ? parsed.data.video_privacy ?? null : null,
            },
          }
        : {}),
    });
  } catch (error) {
    // The same file is already on the planner: the copy just uploaded isn't kept.
    if (error instanceof DuplicateMediaError) {
      for (const key of [parsed.data.media_key, parsed.data.cover_key].filter((k): k is string => Boolean(k))) await deleteObject(key).catch(() => undefined);
      return { error: error.message, duplicate: true };
    }
    return { error: error instanceof Error ? error.message : "Couldn't queue the upload." };
  }
  // Best-effort: hand any eligible Facebook account straight to Meta's own
  // scheduler now rather than waiting for the cron to fire it later.
  if (parsed.data.caption) await submitNativeScheduleForPost(postId);
  revalidatePath("/dashboard/social/planner");
  return { ok: true };
}

export async function deletePost(id: string) {
  await assertAuthed();
  // Its Facebook draft first (or it still fires), then the files and the post (lib/planner-post-ops.ts).
  await removePost(id);
  revalidatePath("/dashboard/social/planner");
}

/** "Needs changes" → back to waiting for a caption, keeping the image
 *  (Shoaib decided it can go out as it is). */
export async function clearPostChanges(id: string) {
  await assertAuthed();
  if (!z.string().uuid().safeParse(id).success) return { error: "Not found." };
  try {
    await clearPostFlag(id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't clear it." };
  }
  revalidatePath("/dashboard/social/planner");
  revalidatePath("/portal/planner");
  return { ok: true };
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Drag up/down inside a day (or a drop onto a card of another day): `ids`
 *  is that day's posts in their new order. */
export async function reorderDay(date: string, ids: string[]) {
  await assertAuthed();
  const parsed = dateSchema.safeParse(date);
  const list = z.array(z.string().uuid()).min(1).max(50).safeParse(ids);
  if (!parsed.success || !list.success) return { error: "Invalid order." };
  try {
    const changed = await reorderPostsOnDay(parsed.data, list.data);
    // Posts already handed to Meta's scheduler follow their new time.
    for (const id of changed) await rescheduleNativePosts(id);
    revalidatePath("/dashboard/social/planner");
    return { ok: true, changed: changed.length };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't reorder the posts." };
  }
}

/** Planner time picker: sets a post's date AND time by hand (time in Pakistan
 *  time, "HH:MM"). Only for a post that hasn't gone out, and only in the
 *  future — the cron would otherwise publish it at once. */
export async function setPostTime(id: string, date: string, time: string) {
  await assertAuthed();
  const d = dateSchema.safeParse(date);
  const t = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).safeParse(time);
  if (!d.success || !t.success) return { error: "Pick a valid date and time." };
  try {
    // Shared with the client portal (lib/planner-post-ops.ts).
    await changePostTime(id, d.data, t.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't change the time." };
  }
  revalidatePath("/dashboard/social/planner");
  revalidatePath("/dashboard/social/stories");
  return { ok: true };
}

/** Drag-and-drop (or a bulk auto-fill correction) moving a post to a
 *  different day. */
export async function movePost(id: string, date: string) {
  await assertAuthed();
  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { error: "Invalid date." };
  await rescheduleScheduledPost(id, parsed.data);
  // If this was already handed to Meta's scheduler for the old date, that
  // draft needs deleting and resubmitting for the new one — otherwise Meta
  // would still fire the stale one too.
  await rescheduleNativePosts(id);
  revalidatePath("/dashboard/social/planner");
}

/** Planner "Publish now": checks first, then out at once (lib/social-publish-now.ts). */
export async function publishPostNow(id: string, confirmChecks = false): Promise<PublishNowResult> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(id).success) return { status: "error", message: "Post not found." };
  try {
    return await publishNow(id, confirmChecks);
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Couldn't publish the post." };
  }
  finally {
    revalidatePath("/dashboard/social/planner");
    revalidatePath("/dashboard/social/stories");
  }
}

/** Planner "Edit caption": saves it and, if the post was already handed to
 *  Meta's scheduler, redoes that draft with the new words. Returns the
 *  pre-flight findings for the new caption so mistakes show at once. */
export async function updatePostCaption(id: string, caption: string): Promise<{ ok: true; findings: Finding[] } | { error: string }> {
  await assertAuthed();
  const parsed = z.object({ id: z.string().uuid(), caption: z.string().trim().min(1, "Write a caption.").max(2200) }).safeParse({ id, caption });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    // Shared with the client portal (lib/planner-post-ops.ts).
    const { findings } = await changePostCaption(parsed.data.id, parsed.data.caption);
    revalidatePath("/dashboard/social/planner");
    return { ok: true, findings };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't save the caption." };
  }
}

/** Planner "Download": a short-lived link to the post's file, while it's still
 *  here. Posted posts' files are removed once the platforms have them. */
export async function postDownloadUrl(id: string): Promise<{ url: string } | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(id).success) return { error: "Post not found." };
  const post = await getScheduledPost(id);
  if (!post) return { error: "Post not found." };
  if (post.status === "posted") return { error: "This post's file was removed after it went out." };
  try {
    return { url: await presignDownload(post.media_key, post.original_filename || "post", 300) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't get the file." };
  }
}

/** Bulk upload from Google Drive, step 1: what's in the folder (lib/planner-drive.ts). */
export async function listDriveFolderForBulk(projectId: string, link: string): Promise<DriveFolderCheck | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success) return { error: "Pick a project first." };
  if (typeof link !== "string" || link.length > 500) return { error: "Paste a Google Drive folder link." };
  try {
    // Already-there files are found by content (Drive's MD5 and file id), not by name.
    return await checkDriveFolder(projectId, link);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't read the Drive folder." };
  }
}

/** Bulk upload from Google Drive, step 2: one file onto the planner, the same as a PC upload. */
export async function importDriveFileForBulk(input: { projectId: string; fileId: string; date: string; platforms: string[] | null }): Promise<{ ok: true } | { error: string }> {
  await assertAuthed();
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      fileId: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      platforms: z.array(z.string().max(40)).max(10).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid file." };
  try {
    await importDriveFile(parsed.data);
    revalidatePath("/dashboard/social/planner");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't import the file." };
  }
}

/** Planner audit (lib/planner-audit.ts): the project's planner against our rules. */
export async function auditPlannerProject(projectId: string): Promise<AuditResult | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success) return { error: "Pick a project first." };
  try {
    return await auditPlanner(projectId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The audit didn't run." };
  }
}

const auditActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("remove"), postId: z.string().uuid() }),
  z.object({ type: z.literal("move"), postId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ type: z.literal("fix-platforms"), postId: z.string().uuid(), platforms: z.array(z.string().max(40)).min(1).max(10) }),
  z.object({ type: z.literal("strip-emoji"), postId: z.string().uuid() }),
  z.object({ type: z.literal("open"), postId: z.string().uuid() }),
]);

/** One audit fix, by click (Remove, Move, Fix, Remove emoji). */
export async function applyPlannerAuditAction(projectId: string, action: AuditAction): Promise<{ ok: true; message: string } | { error: string }> {
  await assertAuthed();
  const parsed = auditActionSchema.safeParse(action);
  if (!z.string().uuid().safeParse(projectId).success || !parsed.success) return { error: "That fix can't be done." };
  try {
    const message = await applyAuditAction(projectId, parsed.data);
    revalidatePath("/dashboard/social/planner");
    revalidatePath("/dashboard/social/stories");
    return { ok: true, message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That fix didn't work." };
  }
}

/** "Fix safe ones": a fresh audit, then only the fixes that can't lose anything. */
export async function fixSafePlannerAudit(projectId: string): Promise<{ done: string[]; failed: string[] } | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success) return { error: "Pick a project first." };
  try {
    const { items } = await auditPlanner(projectId);
    const res = await fixSafeAuditItems(projectId, items);
    revalidatePath("/dashboard/social/planner");
    return res;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The fixes didn't run." };
  }
}

/** Bulk upload from Google Drive, step 3: every file of the folder on the planner now? (by content) */
export async function verifyDriveImportForBulk(projectId: string, link: string): Promise<DriveImportCheck | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success || typeof link !== "string" || link.length > 500) return { error: "Invalid folder." };
  try {
    return await verifyDriveImport(projectId, link);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't read the Drive folder." };
  }
}

/** Create post: a picture or video from a link (any public link or a Google Drive file),
 *  copied to storage with the same checks as a chat upload, ready for the composer. */
export async function fetchPlannerMediaFromLink(
  projectId: string,
  link: string,
  kind: "post" | "reel" | "story" | "video"
): Promise<{ key: string; name: string; mime: string; size: number; seconds: number | null; previewUrl: string } | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success) return { error: "Pick a project first." };
  if (typeof link !== "string" || !/^https:\/\//i.test(link.trim()) || link.length > 2000) return { error: "Paste a full https:// link." };
  if (!["post", "reel", "story", "video"].includes(kind)) return { error: "Unknown post type." };
  try {
    const media = await loadMedia({ url: link.trim() });
    if ((kind === "reel" || kind === "video") && !media.video) return { error: `This link is a picture. Choose a video for a ${kind === "reel" ? "Reel" : "video"}, or switch to Post.` };
    if (kind === "post" && media.video) return { error: "This link is a video. Switch to Reel / Short or Video." };
    // Already on the planner (the same file, whatever its name)? Said now, not after Schedule.
    const fingerprint = await fingerprintBuffer(media.buffer, media.video, media.seconds);
    const match = await findContentMatch(projectId, fingerprint, { story: kind === "story" });
    if (match) return { error: `${describeMatch(match)}. Not added again.` };
    const key = `social/${projectId}/${randomUUID()}-${media.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150)}`;
    await uploadObject(key, media.buffer, media.mime);
    return { key, name: media.name, mime: media.mime, size: media.buffer.length, seconds: media.seconds, previewUrl: await presignDownload(key, undefined, 3600) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't get the file from that link." };
  }
}

/** Create post closed (or another file chosen) after a link fetch: the copy no post uses is removed. */
export async function discardPlannerMedia(projectId: string, key: string): Promise<void> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(projectId).success || typeof key !== "string" || !key.startsWith(`social/${projectId}/`) || key.includes("..")) return;
  const { count } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("media_key", key);
  if (!count) await deleteObject(key).catch(() => undefined);
}

/** Post details "Change image": a new picture or video for the post, everything else kept (lib/planner-post-ops.ts). */
export async function replacePostFile(postId: string, key: string, name: string): Promise<{ ok: true; notes: string[] } | { error: string }> {
  await assertAuthed();
  if (!z.string().uuid().safeParse(postId).success || typeof key !== "string" || typeof name !== "string" || name.length > 300) return { error: "That file couldn't be read." };
  try {
    const { notes } = await replacePostMedia(postId, { key, name });
    revalidatePath("/dashboard/social/planner");
    revalidatePath("/dashboard/social/stories");
    return { ok: true, notes };
  } catch (error) {
    // The new copy isn't used by any post, so it doesn't stay behind.
    const { count } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("media_key", key);
    if (!count && key.startsWith("social/")) await deleteObject(key).catch(() => undefined);
    return { error: error instanceof Error ? error.message : "Couldn't change the file." };
  }
}
