import "server-only";
import { randomUUID } from "node:crypto";
import { apiKey, downloadFile, listFolder, parseDriveFolderId } from "@/lib/story-drive";
import { deleteObject, uploadObject } from "@/lib/storage";
import { createScheduledPost, dateToScheduledAt } from "@/lib/scheduled-posts";
import { lengthFits } from "@/lib/planner-rules";
import { describeMatch, DuplicateMediaError, fingerprintBuffer, matchIn, projectPrints } from "@/lib/media-fingerprint";

/**
 * Bulk upload from a public Google Drive folder (Shoaib, 2026-11-09): the same
 * rules as choosing files on the PC, the files just come from Drive. Images
 * become photo posts, MP4/MOV videos become Reels. The Drive original is never
 * touched; each file is copied to our storage, one per request, so a slow
 * video can't take the others down with it.
 *
 * Duplicates are found by content, not by name: monthly folders reuse names
 * (1.png, Friday-1.png…) for new posts. A file is skipped only when the same
 * Drive file or the same bytes (Drive's MD5) are already on the planner or
 * went out in the last 90 days.
 */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);
const MB = 1024 * 1024;
// Images as on the PC. Videos lower than the PC's 300 MB: a Drive copy has to
// download and re-upload within one request; bigger ones go up from the PC.
const MAX_IMAGE = 25 * MB;
const MAX_VIDEO = 100 * MB;

export type DriveImportFile = { id: string; name: string; mimeType: string; size: number; kind: "post" | "reel"; seconds: number | null; md5: string | null };
export type DriveImportList = { files: DriveImportFile[]; unsupported: string[]; tooBig: string[] };

export async function listDriveImport(link: string): Promise<DriveImportList> {
  const folderId = parseDriveFolderId(link);
  if (!folderId) throw new Error("That isn't a Google Drive folder link.");
  const all = await listFolder(folderId, await apiKey());
  const files: DriveImportFile[] = [];
  const unsupported: string[] = [];
  const tooBig: string[] = [];
  for (const f of all) {
    if (f.mimeType === "application/vnd.google-apps.folder") continue;
    const size = Number(f.size ?? 0);
    const kind = IMAGE_TYPES.has(f.mimeType) ? "post" : VIDEO_TYPES.has(f.mimeType) ? "reel" : null;
    if (!kind) unsupported.push(f.name);
    else if (size > (kind === "post" ? MAX_IMAGE : MAX_VIDEO)) tooBig.push(f.name);
    else {
      const ms = Number(f.videoMediaMetadata?.durationMillis ?? NaN);
      files.push({ id: f.id, name: f.name, mimeType: f.mimeType, size, kind, seconds: Number.isFinite(ms) ? ms / 1000 : null, md5: f.md5Checksum?.toLowerCase() ?? null });
    }
  }
  return { files, unsupported, tooBig };
}

export type DriveFolderCheck = {
  /** New files, in name order. */
  files: DriveImportFile[];
  /** Skipped: "name: why". */
  duplicates: string[];
  /** Same name as a post whose content can't be compared (posted before fingerprints): imported, worth a look. */
  nameNotes: string[];
  unsupported: string[];
  tooBig: string[];
};

/** The folder against the project's planner: which files are new, which are already there (by content). */
export async function checkDriveFolder(projectId: string, link: string): Promise<DriveFolderCheck> {
  const list = await listDriveImport(link);
  const prints = await projectPrints(projectId);
  const sorted = [...list.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const files: DriveImportFile[] = [];
  const duplicates: string[] = [];
  const nameNotes: string[] = [];
  const seen = new Map<string, string>();
  for (const f of sorted) {
    const match = matchIn(prints, { md5: f.md5, driveId: f.id }, { story: false });
    if (match) {
      duplicates.push(`${f.name}: ${describeMatch(match)}`);
      continue;
    }
    if (f.md5 && seen.has(f.md5)) {
      duplicates.push(`${f.name}: the same file as ${seen.get(f.md5)} in this folder`);
      continue;
    }
    if (f.md5) seen.set(f.md5, f.name);
    const legacy = prints.find((p) => !p.media_md5 && p.post_type !== "story" && p.original_filename.toLowerCase() === f.name.toLowerCase());
    if (legacy) nameNotes.push(`${f.name} (an older ${legacy.original_filename} is ${legacy.status === "posted" ? "posted" : "on the planner"}${legacy.scheduled_at ? `, ${legacy.scheduled_at.slice(0, 10)}` : ""})`);
    files.push(f);
  }
  return { files, duplicates, nameNotes, unsupported: list.unsupported, tooBig: list.tooBig };
}

type FileMeta = { name: string; mimeType: string; size?: string; md5Checksum?: string; videoMediaMetadata?: { durationMillis?: string } };

// Drive's own word on the file, so nothing the browser sent decides its type or size.
export async function fileMeta(fileId: string, key: string): Promise<FileMeta> {
  const q = new URLSearchParams({ fields: "name,mimeType,size,md5Checksum,videoMediaMetadata(durationMillis)", supportsAllDrives: "true", key });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${q}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? "File not found in Drive." : `Google Drive: HTTP ${res.status}`);
  return (await res.json()) as FileMeta;
}

/**
 * Copies one Drive file to our storage and puts it on the planner for `date`,
 * waiting for a caption. `platforms` null = everywhere the project is
 * connected; a Reel's list must only hold platforms its length fits.
 */
export async function importDriveFile(input: { projectId: string; fileId: string; date: string; platforms: string[] | null }): Promise<void> {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(input.fileId)) throw new Error("Not a Drive file.");
  const key = await apiKey();
  const meta = await fileMeta(input.fileId, key);
  const isVideo = VIDEO_TYPES.has(meta.mimeType);
  if (!isVideo && !IMAGE_TYPES.has(meta.mimeType)) throw new Error(`${meta.name}: this file type can't be posted.`);
  if (Number(meta.size ?? 0) > (isVideo ? MAX_VIDEO : MAX_IMAGE)) throw new Error(`${meta.name} is too big here (images 25 MB, videos 100 MB from Drive; upload bigger videos from the PC).`);
  const ms = Number(meta.videoMediaMetadata?.durationMillis ?? NaN);
  const seconds = isVideo && Number.isFinite(ms) ? ms / 1000 : null;
  if (input.platforms !== null) {
    if (input.platforms.length === 0) throw new Error(`${meta.name}: none of the selected platforms take this.`);
    if (isVideo && input.platforms.some((p) => !lengthFits("reel", p, seconds))) throw new Error(`${meta.name}: its length doesn't fit every selected platform.`);
  }
  // Already there? Checked before downloading, so a duplicate costs nothing.
  const early = matchIn(await projectPrints(input.projectId), { md5: meta.md5Checksum?.toLowerCase() ?? null, driveId: input.fileId }, { story: false });
  if (early) throw new DuplicateMediaError(early);

  const body = await downloadFile(input.fileId, key);
  const fingerprint = await fingerprintBuffer(body, isVideo, seconds);
  const safeName = meta.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  const storageKey = `social/${input.projectId}/${randomUUID()}-${safeName}`;
  await uploadObject(storageKey, body, meta.mimeType);
  try {
    await createScheduledPost({
      project_id: input.projectId,
      media_key: storageKey,
      original_filename: meta.name,
      scheduled_at: dateToScheduledAt(input.date),
      target_platforms: input.platforms,
      fingerprint,
      source_drive_id: input.fileId,
      ...(isVideo ? { reel: { post_type: "reel" as const, cover_key: null } } : {}),
    });
  } catch (error) {
    await deleteObject(storageKey).catch(() => undefined);
    throw error;
  }
}

export type DriveImportCheck = { total: number; onPlanner: number; leftBehind: string[]; cantTake: string[] };

/**
 * After an import: is every file of the folder on the planner? Matched by the
 * Drive file id or the content (MD5), never by name. A file the same as
 * another one in the folder counts as there.
 */
export async function verifyDriveImport(projectId: string, link: string): Promise<DriveImportCheck> {
  const check = await checkDriveFolder(projectId, link);
  return {
    total: check.files.length + check.duplicates.length,
    onPlanner: check.duplicates.length,
    leftBehind: check.files.map((f) => f.name),
    cantTake: [...check.unsupported.map((n) => `${n} (not a JPG/PNG/WebP or MP4/MOV)`), ...check.tooBig.map((n) => `${n} (too big from Drive; upload it from the PC)`)],
  };
}
