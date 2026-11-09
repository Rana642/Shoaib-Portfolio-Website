import "server-only";
import { apiKey, downloadFile, listFolder, parseDriveFolderId } from "@/lib/story-drive";
import { uploadObject } from "@/lib/storage";
import { createScheduledPost, dateToScheduledAt } from "@/lib/scheduled-posts";

/**
 * Bulk upload from a public Google Drive folder (Shoaib, 2026-11-09): the same
 * rules as choosing files on the PC, the files just come from Drive. Images
 * become photo posts, MP4/MOV videos become Reels. The Drive original is never
 * touched; each file is copied to our storage, one per request, so a slow
 * video can't take the others down with it.
 */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);
const MB = 1024 * 1024;
// Images as on the PC. Videos lower than the PC's 300 MB: a Drive copy has to
// download and re-upload within one request; bigger ones go up from the PC.
const MAX_IMAGE = 25 * MB;
const MAX_VIDEO = 100 * MB;

/** Reel length each platform takes, in seconds (the composer's own limits). */
export const REEL_SECONDS: Record<string, [number, number]> = {
  facebook: [3, 90],
  instagram: [3, 900],
  youtube: [0, 180],
  tiktok: [0, 600],
};
export const reelFits = (platform: string, seconds: number | null) => {
  const limits = REEL_SECONDS[platform];
  return Boolean(limits) && (seconds === null || (seconds >= limits[0] && seconds <= limits[1]));
};

export type DriveImportFile = { id: string; name: string; mimeType: string; size: number; kind: "post" | "reel"; seconds: number | null };
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
      files.push({ id: f.id, name: f.name, mimeType: f.mimeType, size, kind, seconds: Number.isFinite(ms) ? ms / 1000 : null });
    }
  }
  return { files, unsupported, tooBig };
}

type FileMeta = { name: string; mimeType: string; size?: string; videoMediaMetadata?: { durationMillis?: string } };

// Drive's own word on the file, so nothing the browser sent decides its type or size.
async function fileMeta(fileId: string, key: string): Promise<FileMeta> {
  const q = new URLSearchParams({ fields: "name,mimeType,size,videoMediaMetadata(durationMillis)", supportsAllDrives: "true", key });
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
  if (input.platforms !== null) {
    if (input.platforms.length === 0) throw new Error(`${meta.name}: none of the selected platforms take this.`);
    const ms = Number(meta.videoMediaMetadata?.durationMillis ?? NaN);
    const seconds = Number.isFinite(ms) ? ms / 1000 : null;
    if (isVideo && input.platforms.some((p) => !reelFits(p, seconds))) throw new Error(`${meta.name}: its length doesn't fit every selected platform.`);
  }

  const body = await downloadFile(input.fileId, key);
  const safeName = meta.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  const storageKey = `social/${input.projectId}/${crypto.randomUUID()}-${safeName}`;
  await uploadObject(storageKey, body, meta.mimeType);
  await createScheduledPost({
    project_id: input.projectId,
    media_key: storageKey,
    original_filename: meta.name,
    scheduled_at: dateToScheduledAt(input.date),
    target_platforms: input.platforms,
    ...(isVideo ? { reel: { post_type: "reel" as const, cover_key: null } } : {}),
  });
}
