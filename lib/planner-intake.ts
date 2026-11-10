import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/dashboard/db";
import { deleteObject, fetchObject, uploadObject } from "@/lib/storage";
import { apiKey, downloadFile } from "@/lib/story-drive";
import { checkDriveFolder, fileMeta, importDriveFile } from "@/lib/planner-drive";
import { DuplicateMediaError, fingerprintBuffer, findContentMatch } from "@/lib/media-fingerprint";
import { fetchPublicUrl } from "@/lib/safe-fetch";
import { GBP_PLATFORM, gbpPlannerLocation } from "@/lib/gbp";
import {
  createScheduledPost,
  dateToScheduledAt,
  getScheduledPost,
  nativeDraftChangeable,
  pktToScheduledAt,
  setCaptionAndSchedule,
} from "@/lib/scheduled-posts";
import { preflightPost } from "@/lib/post-preflight";
import type { Finding } from "@/lib/post-preflight-checks";
import { rescheduleNativePosts, submitNativeScheduleForPost } from "@/lib/social-post";
import { lengthProblem, planBulkDates, pktToday, pktTomorrow, takes } from "@/lib/planner-rules";
import type { PostType, ScheduledPost, VideoPrivacy } from "@/lib/dashboard/types";

/**
 * Adding and changing Planner posts from a chat (MCP tools, the planner upload
 * link), with the same rules as the dashboard: JPG/PNG/WebP pictures up to
 * 25 MB, MP4/MOV videos up to 100 MB, each kind only to the platforms that
 * take it, video length per platform, a time that is still ahead, and the
 * same pre-flight checks before anything is scheduled (Shoaib, 2026-11-09).
 */

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 25 * MB;
export const MAX_VIDEO_BYTES = 100 * MB;

// ── media ────────────────────────────────────────────────────────────

type MediaType = { mime: string; ext: string; video: boolean };

/** The file's real type from its first bytes; null for anything the planner doesn't post. */
export function sniffMedia(b: Buffer): MediaType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", video: false };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png", video: false };
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", video: false };
  if (b.length >= 12) {
    const box = b.toString("ascii", 4, 8);
    if (box === "ftyp") {
      const brand = b.toString("ascii", 8, 12);
      if (/^(heic|heix|heim|heis|hevc|mif1|msf1|avif|avis)/.test(brand)) return null; // HEIC/AVIF pictures
      return brand === "qt  " ? { mime: "video/quicktime", ext: "mov", video: true } : { mime: "video/mp4", ext: "mp4", video: true };
    }
    if (["moov", "mdat", "wide", "free", "skip"].includes(box)) return { mime: "video/quicktime", ext: "mov", video: true };
  }
  return null;
}

/** An MP4/MOV's length in seconds from its movie header (moov → mvhd), or null when it can't be read. */
export function videoSeconds(b: Buffer): number | null {
  const find = (start: number, end: number, type: string): [number, number] | null => {
    let i = start;
    while (i + 8 <= end) {
      let size = b.readUInt32BE(i);
      const t = b.toString("ascii", i + 4, i + 8);
      let header = 8;
      if (size === 1) {
        if (i + 16 > end) return null;
        size = Number(b.readBigUInt64BE(i + 8));
        header = 16;
      } else if (size === 0) {
        size = end - i;
      }
      if (size < header) return null;
      if (t === type) return [i + header, Math.min(i + size, end)];
      i += size;
    }
    return null;
  };
  try {
    const moov = find(0, b.length, "moov");
    const mvhd = moov && find(moov[0], moov[1], "mvhd");
    if (!mvhd) return null;
    const p = mvhd[0];
    const v1 = b[p] === 1;
    if (p + (v1 ? 32 : 20) > mvhd[1]) return null;
    const timescale = b.readUInt32BE(p + (v1 ? 20 : 12));
    const duration = v1 ? Number(b.readBigUInt64BE(p + 24)) : b.readUInt32BE(p + 16);
    if (!timescale || (!v1 && duration === 0xffffffff)) return null;
    return duration / timescale;
  } catch {
    return null;
  }
}

export type ChatFile = { download_url: string; file_id?: string; mime_type?: string | null; file_name?: string | null };
export type LoadedMedia = { buffer: Buffer; name: string; mime: string; ext: string; video: boolean; seconds: number | null; storageKey?: string };

const DRIVE_FOLDER = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//;
const DRIVE_FILE = /(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([A-Za-z0-9_-]{10,})/;

// Chat and generated pictures often come as "image.png"; two of those would
// look like the same file to the duplicate check, so they get a dated name.
const GENERIC_NAME = /^(image|img|file|photo|picture|untitled|download|upload|generated[-_ ]?image|chatgpt[^.]*|dall[-_ ]?e[^.]*)([-_ ]?\(?\d+\)?)?(\.\w+)?$/i;

function finalName(raw: string | null | undefined, ext: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  if (!base || GENERIC_NAME.test(base) || /^[0-9a-f-]{20,}(\.\w+)?$/i.test(base)) {
    const stamp = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    return `chat-${stamp}-${randomUUID().slice(0, 4)}.${ext}`;
  }
  const clean = base.replace(/[\u0000-\u001f]/g, "").slice(-150);
  return /\.\w{2,5}$/.test(clean) ? clean : `${clean}.${ext}`;
}

function checkMedia(buffer: Buffer, name: string | null | undefined): LoadedMedia {
  const type = sniffMedia(buffer);
  if (!type) throw new Error("Only JPG, PNG or WebP pictures and MP4/MOV videos can go on the planner.");
  if (buffer.length > (type.video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    throw new Error(type.video ? "Videos can be up to 100 MB here. Upload bigger ones from the Planner on a PC." : "Pictures can be up to 25 MB.");
  }
  return { buffer, ...type, name: finalName(name, type.ext), seconds: type.video ? videoSeconds(buffer) : null };
}

/** The file a chat handed over: a ChatGPT file, or a link (a Google Drive file or any public https link). */
export async function loadMedia(src: { file?: ChatFile | null; url?: string | null; fileName?: string | null }): Promise<LoadedMedia> {
  const given = [src.file, src.url].filter(Boolean).length;
  if (given !== 1) throw new Error("Give exactly one of: file (a picture or video from the chat) or url (a link to it).");

  if (src.file) {
    if (!src.file.download_url) throw new Error("The chat file has no download link. Send the picture again, or use social_create_upload_link.");
    const { buffer } = await fetchPublicUrl(src.file.download_url, MAX_VIDEO_BYTES, 45_000);
    return checkMedia(buffer, src.fileName || src.file.file_name);
  }

  const url = src.url!.trim();
  if (DRIVE_FOLDER.test(url)) throw new Error("That is a Drive folder. Use social_import_drive_folder for a whole folder.");
  const drive = DRIVE_FILE.exec(url);
  if (drive) {
    const key = await apiKey();
    const meta = await fileMeta(drive[1], key);
    const size = Number(meta.size ?? 0);
    if (size > MAX_VIDEO_BYTES) throw new Error(`${meta.name} is bigger than 100 MB. Upload it from the Planner on a PC.`);
    const buffer = await downloadFile(drive[1], key);
    const media = checkMedia(buffer, src.fileName || meta.name);
    const ms = Number(meta.videoMediaMetadata?.durationMillis ?? NaN);
    return media.video && media.seconds === null && Number.isFinite(ms) ? { ...media, seconds: ms / 1000 } : media;
  }
  const { buffer, url: finalUrl } = await fetchPublicUrl(url, MAX_VIDEO_BYTES, 45_000);
  return checkMedia(buffer, src.fileName || decodeURIComponent(finalUrl.pathname.split("/").pop() ?? ""));
}

/** A file the planner upload page already put in storage (under social/<project>/). */
export async function loadStoredMedia(key: string, name: string): Promise<LoadedMedia> {
  const { buffer } = await fetchObject(key);
  return { ...checkMedia(buffer, name), storageKey: key };
}

// ── projects and platforms ───────────────────────────────────────────

type ProjectRow = { id: string; name: string; clients: { name: string } | { name: string }[] | null };
const labelOf = (p: ProjectRow) => `${(Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "Unknown"} — ${p.name}`;

/** A project by its id or (part of) its name or "Client — Project" label. */
export async function resolveProject(ref: string): Promise<{ id: string; label: string }> {
  const { data, error } = await db.from("client_projects").select("id, name, clients(name)");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ProjectRow[];
  const byId = rows.find((p) => p.id === ref.trim());
  if (byId) return { id: byId.id, label: labelOf(byId) };
  const needle = ref.trim().toLowerCase();
  const exact = rows.filter((p) => p.name.toLowerCase() === needle || labelOf(p).toLowerCase() === needle);
  const matches = exact.length ? exact : rows.filter((p) => labelOf(p).toLowerCase().includes(needle));
  if (matches.length === 1) return { id: matches[0].id, label: labelOf(matches[0]) };
  if (matches.length > 1) throw new Error(`"${ref}" matches several projects: ${matches.map(labelOf).join("; ")}. Be more specific.`);
  throw new Error(`No project matches "${ref}". Projects: ${rows.map(labelOf).sort().join("; ")}.`);
}

/** The platforms a project's posts can go to now (the same list the Planner shows). */
export async function connectedPlatforms(projectId: string): Promise<string[]> {
  const { data } = await db.from("client_social_accounts").select("platform").eq("project_id", projectId).eq("is_active", true);
  const list = [...new Set((data ?? []).map((a) => a.platform as string))];
  if (await gbpPlannerLocation(projectId).catch(() => null)) list.push(GBP_PLATFORM);
  return list;
}

const ALIASES: Record<string, string> = {
  fb: "facebook", ig: "instagram", insta: "instagram", yt: "youtube", gbp: "google_business", google: "google_business",
  "google business": "google_business", "google business profile": "google_business", li: "linkedin", tt: "tiktok",
};
const normalize = (p: string) => ALIASES[p.trim().toLowerCase()] ?? p.trim().toLowerCase().replace(/\s+/g, "_");

const KIND_WORD: Record<PostType, string> = { post: "a picture post", reel: "a Reel", story: "a Story", video: "a video" };

/**
 * Where a post of `kind` goes. `requested` null = every connected platform
 * that takes it (dropping those a video's length doesn't fit). `target` is
 * what's stored: null when that is the whole connected list.
 */
export function pickPlatforms(kind: PostType, connected: string[], requested: string[] | null, seconds: number | null): { list: string[]; target: string[] | null; dropped: string[] } {
  if (connected.length === 0) {
    if (requested?.length) throw new Error("Nothing is connected for this project yet, so it can't post anywhere. Connect a platform first, or leave platforms out and the post waits.");
    return { list: [], target: null, dropped: [] };
  }
  const able = connected.filter((p) => takes(kind, p));
  if (able.length === 0) throw new Error(`None of this project's connected platforms (${connected.join(", ")}) takes ${KIND_WORD[kind]}.`);
  const dropped: string[] = [];
  let list: string[];
  if (requested) {
    list = [...new Set(requested.map(normalize))];
    if (list.length === 0) throw new Error("Pick at least one platform, or leave platforms out for all of them.");
    const notConnected = list.filter((p) => !connected.includes(p));
    if (notConnected.length) throw new Error(`Not connected for this project: ${notConnected.join(", ")}. Connected: ${connected.join(", ")}.`);
    const wrongKind = list.filter((p) => !takes(kind, p));
    if (wrongKind.length) throw new Error(`${wrongKind.join(", ")} can't take ${KIND_WORD[kind]}.`);
    const tooLong = list.map((p) => lengthProblem(kind, p, seconds)).filter((m): m is string => Boolean(m));
    if (tooLong.length) throw new Error(`${tooLong.join(" ")} Leave that platform out or trim the video.`);
  } else {
    list = able.filter((p) => {
      const problem = lengthProblem(kind, p, seconds);
      if (problem) dropped.push(problem);
      return !problem;
    });
    if (list.length === 0) throw new Error(`The video's length doesn't fit any connected platform. ${dropped.join(" ")}`);
  }
  const whole = list.length === connected.length && connected.every((p) => list.includes(p));
  return { list, target: whole ? null : list, dropped };
}

async function projectPosts(projectId: string) {
  const { data, error } = await db.from("scheduled_posts").select("id, original_filename, scheduled_at, post_type").eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; original_filename: string; scheduled_at: string | null; post_type: PostType | null }[];
}

const pktDate = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
export const pktWhen = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " PKT";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
function checkDate(date: string) {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`"${date}" isn't a date (YYYY-MM-DD).`);
  if (date < pktToday()) throw new Error(`${date} has already passed (Pakistan time).`);
}

// ── add ──────────────────────────────────────────────────────────────

export type AddPostResult = {
  postId: string;
  kind: PostType;
  name: string;
  scheduledAt: string;
  platforms: string[];
  status: "scheduled" | "pending_caption";
  fixes: Finding[];
  checks: Finding[];
  notes: string[];
};

/**
 * Puts one picture or video on a project's planner. With a caption (and no
 * FIX finding) it is scheduled at once, like captioning it on the Planner;
 * a FIX leaves it waiting for a caption with the findings returned. A Story
 * needs no caption and is scheduled straight away.
 */
export async function addPlannerPost(input: {
  projectId: string;
  media: LoadedMedia;
  date?: string | null;
  time?: string | null;
  platforms?: string[] | null;
  postType?: PostType | null;
  caption?: string | null;
  videoTitle?: string | null;
  videoPrivacy?: VideoPrivacy | null;
  /** Publish now follows: no Facebook draft is handed over (it would only be cancelled). */
  publishingNow?: boolean;
}): Promise<AddPostResult> {
  const { media } = input;
  const notes: string[] = [];
  const cleanup = async () => {
    await deleteObject(key).catch(() => undefined);
  };

  const kind: PostType = input.postType ?? (media.video ? "reel" : "post");
  if (!media.video && (kind === "reel" || kind === "video")) throw new Error("This is a picture: it can be a post or a Story, not a Reel or video.");
  if (media.video && kind === "post") throw new Error("This is a video: make it a Reel, a Story or a video.");
  if (media.video && media.seconds === null) notes.push("The video's length couldn't be read, so the per-platform length limits weren't checked.");

  const { list, target, dropped } = pickPlatforms(kind, await connectedPlatforms(input.projectId), input.platforms ?? null, media.seconds);
  for (const d of dropped) notes.push(`Left out: ${d}`);

  // Duplicates by content, not name: the same file already on the planner (or
  // posted in the last 90 days) is refused; a picture that only LOOKS the same
  // is added with a note to look at it.
  const posts = await projectPosts(input.projectId);
  const fingerprint = await fingerprintBuffer(media.buffer, media.video, media.seconds);
  const exact = await findContentMatch(input.projectId, fingerprint, { story: kind === "story" });
  if (exact) {
    if (media.storageKey) await deleteObject(media.storageKey).catch(() => undefined);
    throw new DuplicateMediaError(exact);
  }
  const lookalike = media.video ? null : await findContentMatch(input.projectId, { phash: fingerprint.phash }, { story: kind === "story", looks: true });
  if (lookalike) notes.push(`Check: a picture that looks the same is ${lookalike.status === "posted" ? "already posted" : "on the planner"}: ${lookalike.original_filename}${lookalike.scheduled_at ? ` (${pktDate(lookalike.scheduled_at)})` : ""}. Remove one if it is a repeat.`);

  if (input.time && !TIME.test(input.time)) throw new Error(`"${input.time}" isn't a time (HH:MM, 24-hour, Pakistan time).`);
  if (input.time && !input.date) throw new Error("Give the date (YYYY-MM-DD) together with the time.");
  let date = input.date ?? null;
  if (date) checkDate(date);
  else {
    // The next free day from tomorrow, Stories on their own calendar.
    const isStory = kind === "story";
    const busy = new Set(posts.filter((p) => p.scheduled_at && (p.post_type === "story") === isStory).map((p) => pktDate(p.scheduled_at!)));
    date = planBulkDates([media.name], pktTomorrow(), busy)[0];
  }
  const sameDay = posts.filter((p) => p.scheduled_at && pktDate(p.scheduled_at) === date).length;
  const scheduledAt = input.time ? pktToScheduledAt(date, input.time) : dateToScheduledAt(date, Math.min(sameDay * 5, 600));
  if (new Date(scheduledAt).getTime() <= Date.now() + 60_000) {
    throw new Error(input.time ? "That time has already passed (Pakistan time). Pick a later time." : "The default time (10:00 AM Pakistan time) has passed for that day. Give a later time (HH:MM), or another date.");
  }

  const key = media.storageKey ?? `social/${input.projectId}/${randomUUID()}-${media.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150)}`;
  if (!media.storageKey) await uploadObject(key, media.buffer, media.mime);

  let postId: string;
  try {
    postId = await createScheduledPost({
      project_id: input.projectId,
      media_key: key,
      original_filename: media.name,
      scheduled_at: scheduledAt,
      ...(input.time ? { time_manual: true } : {}),
      target_platforms: target,
      fingerprint,
      ...(kind !== "post"
        ? {
            reel: {
              post_type: kind,
              cover_key: null,
              video_title: kind === "story" ? null : input.videoTitle?.trim().slice(0, 100) || null,
              video_privacy: kind === "video" ? input.videoPrivacy ?? null : null,
            },
          }
        : {}),
    });
  } catch (error) {
    await cleanup();
    throw error;
  }

  const caption = input.caption?.trim() || null;
  const result: AddPostResult = { postId, kind, name: media.name, scheduledAt, platforms: list, status: kind === "story" ? "scheduled" : "pending_caption", fixes: [], checks: [], notes };

  if (kind === "story") {
    if (caption) notes.push("Stories carry no caption, so the caption was not used.");
    const { findings } = await preflightPost({ postId }).catch(() => ({ findings: [] as Finding[] }));
    result.fixes = findings.filter((f) => f.severity === "fix");
    result.checks = findings.filter((f) => f.severity !== "fix" && f.code !== "no-caption");
    if (result.fixes.length) {
      // A Story is scheduled the moment it's added, so one with a FIX can't stay.
      await db.from("scheduled_posts").delete().eq("id", postId);
      await cleanup();
      throw new Error(`Not added: ${result.fixes.map((f) => f.en).join(" ")}`);
    }
    return result;
  }

  if (!caption) {
    notes.push("No caption yet: it waits on the planner until one is set (social_set_caption_and_schedule).");
    return result;
  }
  const { findings } = await preflightPost({ postId, caption, scheduledAt }).catch(() => ({ findings: [] as Finding[] }));
  result.fixes = findings.filter((f) => f.severity === "fix");
  result.checks = findings.filter((f) => f.severity !== "fix");
  if (result.fixes.length) {
    notes.push("Not scheduled because of the FIX items: it waits on the planner without a caption. Fix the caption, then call social_set_caption_and_schedule.");
    return result;
  }
  await setCaptionAndSchedule(postId, caption);
  result.status = "scheduled";
  if (!input.publishingNow) await submitNativeScheduleForPost(postId);
  return result;
}

// ── change ───────────────────────────────────────────────────────────

const isVideoKey = (key: string) => /\.(mp4|mov|m4v)$/i.test(key);

/**
 * Changes a post's day/time, platforms or kind (the caption has its own
 * tool). Only before it goes out; a Facebook copy already handed to Meta is
 * redone only while its time is clearly ahead and nothing has gone out.
 */
export async function updatePlannerPost(input: {
  postId: string;
  date?: string | null;
  time?: string | null;
  platforms?: string[] | "all" | null;
  postType?: PostType | null;
}): Promise<{ post: ScheduledPost; platforms: string[]; findings: Finding[]; notes: string[] }> {
  const post = await getScheduledPost(input.postId);
  if (!post) throw new Error(`No post found with id '${input.postId}'.`);
  if (post.status === "posted" || post.status === "failed") throw new Error("This post has already gone out (or failed), so it can't be changed. Use the retry or add it again.");
  const claimed = (post as ScheduledPost & { claimed_until?: string | null }).claimed_until;
  if (claimed && new Date(claimed).getTime() > Date.now()) throw new Error("This post is being published right now. Check again in a minute.");
  const native = ((post.result as { native?: { ok?: boolean; native?: boolean }[] } | null)?.native ?? []).filter((r) => r.ok && r.native);
  if (native.length && !nativeDraftChangeable(post)) {
    throw new Error("Facebook already has this post scheduled and its time is close (or part of it has gone out), so it can't be changed safely now.");
  }
  if (!input.date && !input.time && input.platforms == null && !input.postType) throw new Error("Nothing to change: give date/time, platforms or postType.");

  const notes: string[] = [];
  const oldKind: PostType = post.post_type ?? "post";
  const kind: PostType = input.postType ?? oldKind;
  const video = isVideoKey(post.media_key) || oldKind === "reel" || oldKind === "video";
  if (!video && (kind === "reel" || kind === "video")) throw new Error("This is a picture: it can be a post or a Story, not a Reel or video.");
  if (video && kind === "post") throw new Error("This is a video: it can be a Reel, a Story or a video.");

  const patch: Record<string, unknown> = {};

  // Platforms: given, or (when only the kind changes) the current ones that take the new kind.
  const connected = await connectedPlatforms(post.project_id);
  // What it really goes to: a Reel never reaches LinkedIn or Google, whatever is connected.
  let list: string[] = (post.target_platforms ?? connected).filter((p) => takes(oldKind, p));
  const kindChanged = kind !== oldKind;
  if (input.platforms != null || kindChanged) {
    let requested: string[] | null = input.platforms === "all" ? null : input.platforms ?? post.target_platforms;
    if (kindChanged && input.platforms == null && requested) requested = requested.filter((p) => takes(kind, p));
    const seconds = video ? videoSeconds((await fetchObject(post.media_key)).buffer) : null;
    const picked = pickPlatforms(kind, connected, requested?.length ? requested : null, seconds);
    for (const d of picked.dropped) notes.push(`Left out: ${d}`);
    list = picked.list;
    patch.target_platforms = picked.target;
  }

  if (kindChanged) {
    patch.post_type = kind;
    if (kind === "story" && post.status === "pending_caption") patch.status = "scheduled";
    if (oldKind === "story" && kind !== "story" && !post.caption && post.status === "scheduled") patch.status = "pending_caption";
    if (kind === "story") notes.push("Stories carry no caption; a Story goes out at its time.");
  }

  if (input.date || input.time) {
    if (input.time && !TIME.test(input.time)) throw new Error(`"${input.time}" isn't a time (HH:MM, 24-hour, Pakistan time).`);
    const date = input.date ?? (post.scheduled_at ? pktDate(post.scheduled_at) : null);
    if (!date) throw new Error("Give the date (YYYY-MM-DD).");
    checkDate(date);
    let scheduledAt: string;
    if (input.time) {
      scheduledAt = pktToScheduledAt(date, input.time);
      patch.time_manual = true;
    } else if (post.scheduled_at) {
      // A new day keeps the post's time of day.
      const t = new Date(post.scheduled_at);
      const [y, m, d] = date.split("-").map(Number);
      scheduledAt = new Date(Date.UTC(y, m - 1, d, t.getUTCHours(), t.getUTCMinutes(), 0)).toISOString();
    } else {
      scheduledAt = dateToScheduledAt(date);
    }
    if (new Date(scheduledAt).getTime() <= Date.now() + 60_000) throw new Error("That time has already passed (Pakistan time). Pick a later time.");
    patch.scheduled_at = scheduledAt;
  }

  const { error } = await db.from("scheduled_posts").update(patch).eq("id", post.id);
  if (error) throw new Error(error.message);

  // A Facebook copy follows the new time, platforms or kind (cancelled and handed over again).
  const fresh = (await getScheduledPost(post.id))!;
  if (fresh.status === "scheduled" && fresh.caption) await rescheduleNativePosts(post.id);
  const { findings } = await preflightPost({ postId: post.id }).catch(() => ({ findings: [] as Finding[] }));
  return { post: fresh, platforms: list, findings: findings.filter((f) => !(kind === "story" && f.code === "no-caption")), notes };
}

// ── a whole Drive folder ─────────────────────────────────────────────

export type DriveFolderPlan = {
  ready: { id: string; name: string; kind: "post" | "reel"; platforms: string[]; target: string[] | null }[];
  skipped: string[];
  /** Same name as an older post whose content can't be compared: imported, worth a look. */
  nameNotes: string[];
};

async function planDriveFolder(projectId: string, link: string, platforms: string[] | null): Promise<DriveFolderPlan & { connected: string[] }> {
  const check = await checkDriveFolder(projectId, link);
  const connected = await connectedPlatforms(projectId);
  // A wrong platform name fails once here, not once per file.
  const unknown = (platforms ?? []).map(normalize).filter((p) => !connected.includes(p));
  if (unknown.length) throw new Error(`Not connected for this project: ${unknown.join(", ")}. Connected: ${connected.join(", ") || "none"}.`);
  const skipped: string[] = [
    ...check.duplicates,
    ...check.unsupported.map((n) => `${n}: not a JPG/PNG/WebP picture or MP4/MOV video`),
    ...check.tooBig.map((n) => `${n}: too big (pictures 25 MB, videos 100 MB from Drive)`),
  ];
  const ready: DriveFolderPlan["ready"] = [];
  for (const f of check.files) {
    try {
      const picked = pickPlatforms(f.kind, connected, platforms, f.seconds);
      ready.push({ id: f.id, name: f.name, kind: f.kind, platforms: picked.list, target: picked.target });
    } catch (error) {
      skipped.push(`${f.name}: ${error instanceof Error ? error.message : "no platform takes it"}`);
    }
  }
  return { ready, skipped, nameNotes: check.nameNotes, connected };
}

/**
 * Lists (confirm=false) or imports (confirm=true) a shared Drive folder onto a
 * project's planner: the Bulk upload's rules, one free day per file. A big
 * folder goes in parts within `budgetMs`; calling again continues, since
 * files already on the planner are skipped.
 */
export async function importDriveFolder(input: { projectId: string; link: string; startDate?: string | null; platforms?: string[] | null; confirm: boolean; budgetMs: number }) {
  const started = Date.now();
  const plan = await planDriveFolder(input.projectId, input.link, input.platforms ?? null);
  if (!input.confirm) return { mode: "list" as const, ...plan, imported: [], failed: [], remaining: plan.ready.length };

  const start = input.startDate ?? pktTomorrow();
  checkDate(start);
  const posts = await projectPosts(input.projectId);
  const busy = new Set(posts.filter((p) => p.scheduled_at && p.post_type !== "story").map((p) => pktDate(p.scheduled_at!)));
  const dates = planBulkDates(plan.ready.map((f) => f.name), start, busy);
  const imported: { name: string; date: string }[] = [];
  const failed: string[] = [];
  let i = 0;
  for (; i < plan.ready.length; i++) {
    if (Date.now() - started > input.budgetMs) break;
    const f = plan.ready[i];
    try {
      await importDriveFile({ projectId: input.projectId, fileId: f.id, date: dates[i], platforms: f.target });
      imported.push({ name: f.name, date: dates[i] });
    } catch (error) {
      failed.push(`${f.name}: ${error instanceof Error ? error.message : "couldn't import"}`);
    }
  }
  return { mode: "import" as const, ...plan, imported, failed, remaining: plan.ready.length - i };
}
