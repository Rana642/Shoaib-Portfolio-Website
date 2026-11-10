import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "./dashboard/db";
import { fetchObject, headObject } from "./storage";

/**
 * What a planner file IS, so duplicates are found by content and not by file
 * name (Shoaib, 2026-11-09: monthly folders reuse 1.png, Friday-1.png… for new
 * posts). md5 = the exact file; phash = how a picture looks, so a re-saved or
 * resized copy is caught too. Both stay on the post after a posted file is
 * deleted from storage.
 */

export type Fingerprint = { md5: string | null; phash: string | null; seconds: number | null };

export const md5Hex = (b: Buffer) => createHash("md5").update(b).digest("hex");

/** 64-bit difference hash: near-identical pictures differ in only a few bits. */
export async function pictureHash(b: Buffer): Promise<string | null> {
  try {
    const raw = await sharp(b, { failOn: "none" }).flatten({ background: "#ffffff" }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    let bits = BigInt(0);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) bits = (bits << BigInt(1)) | (raw[y * 9 + x] > raw[y * 9 + x + 1] ? BigInt(1) : BigInt(0));
    }
    return bits.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

export function hashDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x > BigInt(0)) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

/** Pictures this close (bits of 64) look the same. Kept tight: designs from one template differ more. */
export const SAME_LOOK_BITS = 3;

const MD5 = /^[0-9a-f]{32}$/i;

export async function fingerprintBuffer(b: Buffer, video: boolean, seconds: number | null = null): Promise<Fingerprint> {
  return { md5: md5Hex(b), phash: video ? null : await pictureHash(b), seconds };
}

/** For a file already in storage (a PC or portal upload): the MD5 from its ETag, and a picture's look. */
export async function fingerprintStored(key: string): Promise<Fingerprint> {
  const head = await headObject(key).catch(() => null);
  if (!head) return { md5: null, phash: null, seconds: null };
  const video = head.contentType.startsWith("video/") || /\.(mp4|mov|m4v)$/i.test(key);
  let md5 = head.etag && MD5.test(head.etag) ? head.etag.toLowerCase() : null;
  let phash: string | null = null;
  // Pictures are small enough to read: their look, and the MD5 when the ETag isn't one.
  if (!video && head.size <= 30 * 1024 * 1024) {
    const { buffer } = await fetchObject(key);
    phash = await pictureHash(buffer);
    md5 ??= md5Hex(buffer);
  }
  return { md5, phash, seconds: null };
}

export type ContentMatch = { id: string; original_filename: string; scheduled_at: string | null; status: string; how: "same file" | "looks the same" | "same Drive file" };

/** A project's post as far as duplicates go. */
export type PostPrint = {
  id: string;
  original_filename: string;
  scheduled_at: string | null;
  status: string;
  post_type: string | null;
  media_md5: string | null;
  media_phash: string | null;
  source_drive_id: string | null;
  created_at: string;
};

const RECENT_DAYS = 90;

/**
 * The project's posts a new file is compared with: every post still to go out,
 * and those posted in the last 90 days (a failed one may be uploaded again).
 * Empty before the fingerprint columns exist.
 */
export async function projectPrints(projectId: string): Promise<PostPrint[]> {
  const since = new Date(Date.now() - RECENT_DAYS * 86400_000).toISOString();
  const { data, error } = await db
    .from("scheduled_posts")
    .select("id, original_filename, scheduled_at, status, post_type, media_key, media_md5, media_phash, source_drive_id, created_at")
    .eq("project_id", projectId)
    .or(`status.in.(pending_caption,needs_changes,scheduled),and(status.eq.posted,created_at.gte.${since})`)
    .limit(3000);
  if (error) {
    if (/media_md5|media_phash|source_drive_id/.test(error.message)) return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as (PostPrint & { media_key: string })[];
  await fillMissingMd5(rows);
  return rows;
}

/**
 * Posts added before fingerprints have none yet. While their file is still in
 * storage its MD5 comes from the ETag (one HEAD, no download) and is saved, so
 * an old upload is recognised too, once and for all.
 */
async function fillMissingMd5(rows: (PostPrint & { media_key: string })[]): Promise<void> {
  const missing = rows.filter((r) => !r.media_md5 && ["pending_caption", "needs_changes", "scheduled"].includes(r.status)).slice(0, 300);
  for (let i = 0; i < missing.length; i += 25) {
    await Promise.all(
      missing.slice(i, i + 25).map(async (r) => {
        const head = await headObject(r.media_key).catch(() => null);
        const md5 = head?.etag && MD5.test(head.etag) ? head.etag.toLowerCase() : null;
        if (!md5) return;
        r.media_md5 = md5;
        await db.from("scheduled_posts").update({ media_md5: md5 }).eq("id", r.id).is("media_md5", null);
      })
    );
  }
}

/**
 * The post in `rows` with the same content: the same Drive file, the same
 * file (MD5), or with `looks` a picture that looks the same. Stories are
 * compared only with Stories and feed posts with feed posts: the same picture
 * as a post and as a Story is on purpose.
 */
export function matchIn(
  rows: PostPrint[],
  fp: { md5?: string | null; phash?: string | null; driveId?: string | null },
  opts: { story: boolean; excludeId?: string; looks?: boolean }
): ContentMatch | null {
  for (const row of rows) {
    if (row.id === opts.excludeId || (row.post_type === "story") !== opts.story) continue;
    if (fp.driveId && row.source_drive_id === fp.driveId) return { ...row, how: "same Drive file" };
    if (fp.md5 && row.media_md5 === fp.md5) return { ...row, how: "same file" };
  }
  if (opts.looks && fp.phash) {
    for (const row of rows) {
      if (row.id === opts.excludeId || (row.post_type === "story") !== opts.story) continue;
      if (row.media_phash && hashDistance(fp.phash, row.media_phash) <= SAME_LOOK_BITS) return { ...row, how: "looks the same" };
    }
  }
  return null;
}

export async function findContentMatch(
  projectId: string,
  fp: { md5?: string | null; phash?: string | null; driveId?: string | null },
  opts: { story: boolean; excludeId?: string; looks?: boolean }
): Promise<ContentMatch | null> {
  if (!fp.md5 && !fp.driveId && !(opts.looks && fp.phash)) return null;
  return matchIn(await projectPrints(projectId), fp, opts);
}

const pktDay = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10) : "no date");

export function describeMatch(m: ContentMatch): string {
  const state = m.status === "posted" ? "already posted" : m.status === "failed" ? "failed" : "on the planner";
  return `${m.how === "looks the same" ? "A picture that looks the same" : "The same file"} is ${state}: ${m.original_filename} (${pktDay(m.scheduled_at)})`;
}

/** Thrown when a post's file is already on the planner (or went out recently). */
export class DuplicateMediaError extends Error {
  constructor(public match: ContentMatch) {
    super(`${describeMatch(match)}. Not added again.`);
    this.name = "DuplicateMediaError";
  }
}
