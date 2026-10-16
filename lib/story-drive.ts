import "server-only";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";
import { uploadObject } from "./storage";
import { listSocialAccountsForProject } from "./social-accounts";
import { instagramOnlineByPktHour } from "./social-best-times";

/**
 * Stories from a public Google Drive folder ("anyone with the link"), per
 * project. Shoaib drops images/videos in the folder; each sync imports the
 * new ones, in random order, as Stories at the followers' active hours, up
 * to `per_day` a day, until the folder is used up. Read with a plain Google
 * API key (API Vault service "google_drive", field "api_key") — no OAuth,
 * since the folder is public.
 *
 * The file is copied to R2 on import (Meta fetches stories from a URL we
 * control); the cron deletes that copy once the story is posted. The Drive
 * original is never touched.
 *
 * No day goes empty (Shoaib, 2026-10-16): the next HORIZON_DAYS are kept
 * filled — new files first (random order), then, once every file has been
 * used, the folder is recycled, least-recently-posted first. A file is never
 * on the calendar twice at the same time.
 */

const DRIVE = "https://www.googleapis.com/drive/v3";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
/** Meta's Page Stories API: video stories must be 3–60 seconds. */
export const FB_STORY_MAX_SECONDS = 60;
/** Instagram stories published through the API — 60 seconds per story. */
export const IG_STORY_MAX_SECONDS = 60;
const MIN_VIDEO_SECONDS = 3;
/** Instagram's API takes story files up to 100 MB; bigger ones go to Facebook only. */
const IG_STORY_MAX_BYTES = 100 * 1024 * 1024;
/** Hours (PKT) used when the account has no followers-online data. */
const DEFAULT_SLOT_HOURS = [10, 12, 14, 16, 18, 20, 21, 22];
/** Stories only between these PKT hours, whatever the data says. */
const EARLIEST_HOUR = 9;
const LATEST_HOUR = 23;
const PKT_MS = 5 * 3600_000;
/** How far ahead the calendar is kept filled. */
const HORIZON_DAYS = 7;

export type StoryDriveSource = {
  project_id: string;
  folder_id: string;
  folder_url: string;
  per_day: number;
  slot_hours: number[] | null;
  slots_updated_at: string | null;
  last_synced_at: string | null;
  last_result: SyncResult | null;
};

export type SyncResult = {
  at: string;
  imported: number;
  /** New files still waiting (import is capped per run). */
  waiting: number;
  skipped: { name: string; reason: string }[];
  error?: string;
};

/** The folder id from a Drive folder link (or a bare id). */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  const m = /\/folders\/([a-zA-Z0-9_-]{10,})/.exec(s) ?? /[?&]id=([a-zA-Z0-9_-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : null;
}

async function apiKey(): Promise<string> {
  const cred = await getVaultCredential("google_drive").catch(() => ({}) as Record<string, string>);
  if (!cred.api_key) throw new Error("Add a Google API key as service 'google_drive' (field 'api_key') in the API Vault.");
  return cred.api_key;
}

type DriveFile = { id: string; name: string; mimeType: string; size?: string; videoMediaMetadata?: { durationMillis?: string } };

async function listFolder(folderId: string, key: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, videoMediaMetadata(durationMillis))",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      key,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${DRIVE}/files?${q}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      throw new Error(res.status === 404 ? "Folder not found — check the link and that it's shared as 'Anyone with the link'." : `Google Drive: ${msg}`);
    }
    files.push(...(json.files ?? []));
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return files;
}

async function downloadFile(fileId: string, key: string): Promise<Buffer> {
  const res = await fetch(`${DRIVE}/files/${fileId}?alt=media&acknowledgeAbuse=true&supportsAllDrives=true&key=${key}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't download from Drive (HTTP ${res.status}).`);
  // When Drive throttles, it answers 200 with an HTML "Sorry…" page instead of the file.
  const type = res.headers.get("content-type") ?? "";
  if (!/^(video|image)\//.test(type)) throw new Error("Google Drive is limiting downloads right now — it will be retried on the next sync.");
  return Buffer.from(await res.arrayBuffer());
}

/** The `perDay` most active PKT hours (Instagram followers online), else a default spread. */
async function slotHours(projectId: string, perDay: number): Promise<number[]> {
  const online = await instagramOnlineByPktHour(projectId);
  const hours = online
    ? online
        .map((v, h) => ({ h, v }))
        .filter((x) => x.h >= EARLIEST_HOUR && x.h <= LATEST_HOUR && x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, perDay)
        .map((x) => x.h)
    : [];
  const fill = DEFAULT_SLOT_HOURS.filter((h) => !hours.includes(h));
  while (hours.length < perDay && fill.length) hours.push(fill.shift()!);
  for (let h = EARLIEST_HOUR; hours.length < perDay && h <= LATEST_HOUR; h++) if (!hours.includes(h)) hours.push(h);
  return hours.sort((a, b) => a - b);
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pktDay = (ms: number) => new Date(ms + PKT_MS).toISOString().slice(0, 10);

type DayLoad = { count: number; hours: Set<number> };

/** Free story slots from now on: per day, the slot hours not yet taken, up to perDay stories. */
function* freeSlots(hours: number[], perDay: number, taken: Map<string, DayLoad>) {
  const earliest = Date.now() + 30 * 60_000;
  const today = pktDay(Date.now());
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const [y, m, dd] = today.split("-").map(Number);
    const dayStart = Date.UTC(y, m - 1, dd + d); // 00:00 of that PKT day, as if UTC
    const key = new Date(dayStart).toISOString().slice(0, 10);
    const load = taken.get(key) ?? { count: 0, hours: new Set<number>() };
    taken.set(key, load);
    for (const h of hours) {
      if (load.count >= perDay) break;
      if (load.hours.has(h)) continue;
      // A few random minutes so stories don't all land on the hour.
      const at = dayStart + h * 3600_000 - PKT_MS + Math.floor(Math.random() * 40) * 60_000;
      if (at < earliest) continue;
      load.hours.add(h);
      load.count++;
      yield new Date(at).toISOString();
    }
  }
}

/** Stories already on the calendar, per PKT day: how many, and which hours. */
function dayLoads(rows: { scheduled_at: unknown }[]): Map<string, DayLoad> {
  const taken = new Map<string, DayLoad>();
  for (const r of rows) {
    const ms = new Date(r.scheduled_at as string).getTime() + PKT_MS;
    const d = new Date(ms).toISOString().slice(0, 10);
    const load = taken.get(d) ?? { count: 0, hours: new Set<number>() };
    load.count++;
    load.hours.add(new Date(ms).getUTCHours());
    taken.set(d, load);
  }
  return taken;
}

const CLAIM_MS = 3 * 60_000;

/** Atomically marks the folder as syncing; false if another sync started in the last 3 minutes. */
async function claim(projectId: string): Promise<boolean> {
  const { data } = await db
    .from("story_drive_sources")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .or(`last_synced_at.is.null,last_synced_at.lt.${new Date(Date.now() - CLAIM_MS).toISOString()}`)
    .select("project_id");
  return Boolean(data?.length);
}

/**
 * Re-places every not-yet-posted Drive story of the project (from 30 min
 * from now) so no day has more than per_day, keeping their order — after a
 * per-day change, or to repair a double-booked calendar. Stories added by
 * hand keep their times and count toward each day's total.
 */
export async function rebalanceDriveStories(projectId: string): Promise<number> {
  const source = await getStoryDriveSource(projectId);
  if (!source) return 0;
  const hours = source.slot_hours?.length ? source.slot_hours : await slotHours(projectId, source.per_day);
  const from = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: rows } = await db
    .from("scheduled_posts")
    .select("id, scheduled_at, drive_file_id")
    .eq("project_id", projectId)
    .eq("post_type", "story")
    .eq("status", "scheduled")
    .gte("scheduled_at", from)
    .order("scheduled_at");
  const all = rows ?? [];
  const movable = all.filter((r) => r.drive_file_id);
  const slots = freeSlots(hours, source.per_day, dayLoads(all.filter((r) => !r.drive_file_id)));
  let moved = 0;
  for (const r of movable) {
    const at = slots.next();
    if (at.done) break;
    if (at.value !== r.scheduled_at) {
      await db.from("scheduled_posts").update({ scheduled_at: at.value }).eq("id", r.id);
      moved++;
    }
  }
  return moved;
}

export async function getStoryDriveSource(projectId: string): Promise<StoryDriveSource | null> {
  const { data } = await db.from("story_drive_sources").select("*").eq("project_id", projectId).maybeSingle();
  return (data as StoryDriveSource | null) ?? null;
}

/**
 * Imports new files from the project's folder as Stories (at most
 * `maxImports` per call — each one is a download + upload). Never throws;
 * the outcome is saved on the source row and returned.
 */
export async function syncStoryFolder(projectId: string, maxImports = 8): Promise<SyncResult> {
  const result: SyncResult = { at: new Date().toISOString(), imported: 0, waiting: 0, skipped: [] };
  const source = await getStoryDriveSource(projectId);
  if (!source) return { ...result, error: "No Drive folder set for this project." };
  // One sync at a time per folder: two at once (Sync now + the cron) would
  // both see the same free slots and double-book the days.
  if (!(await claim(projectId))) return { ...result, error: "A sync is already running for this folder — try again in a minute." };
  try {
    const key = await apiKey();
    const accounts = await listSocialAccountsForProject(projectId);
    const hasFb = accounts.some((a) => a.platform === "facebook");
    const hasIg = accounts.some((a) => a.platform === "instagram");
    if (!hasFb && !hasIg) throw new Error("Connect the project's Facebook Page or Instagram account first.");

    const files = (await listFolder(source.folder_id, key)).filter((f) => IMAGE_TYPES.includes(f.mimeType) || VIDEO_TYPES.includes(f.mimeType));
    // Every earlier use of each file: is it on the calendar now, and when was it last used?
    const ids = files.map((f) => f.id);
    const upcoming = new Set<string>();
    const lastUsed = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db
        .from("scheduled_posts")
        .select("drive_file_id, status, scheduled_at, posted_at")
        .eq("project_id", projectId)
        .in("drive_file_id", ids.slice(i, i + 200));
      for (const r of data ?? []) {
        const id = r.drive_file_id as string;
        if (r.status === "scheduled") upcoming.add(id);
        const t = new Date((r.posted_at ?? r.scheduled_at) as string).getTime();
        lastUsed.set(id, Math.max(lastUsed.get(id) ?? 0, t));
      }
    }
    // New files first, in random order; then the folder again, oldest use first.
    const neverUsed = shuffle(files.filter((f) => !lastUsed.has(f.id)));
    const recycle = shuffle(files.filter((f) => lastUsed.has(f.id) && !upcoming.has(f.id))).sort(
      (a, b) => lastUsed.get(a.id)! - lastUsed.get(b.id)!
    );
    const fresh = [...neverUsed, ...recycle];

    // Refresh the active hours once a day.
    let hours = source.slot_hours;
    if (!hours?.length || !source.slots_updated_at || Date.now() - new Date(source.slots_updated_at).getTime() > 86400_000) {
      hours = await slotHours(projectId, source.per_day);
      await db.from("story_drive_sources").update({ slot_hours: hours, slots_updated_at: new Date().toISOString() }).eq("project_id", projectId);
    }

    // Stories already on the calendar, by PKT day and hour.
    const { data: existing } = await db
      .from("scheduled_posts")
      .select("scheduled_at")
      .eq("project_id", projectId)
      .eq("post_type", "story")
      .in("status", ["scheduled", "pending_caption", "needs_changes"])
      .gte("scheduled_at", new Date(Date.now() - 86400_000).toISOString());
    const slots = freeSlots(hours, source.per_day, dayLoads(existing ?? []));

    let processed = 0;
    let full = false;
    for (const f of fresh) {
      if (processed >= maxImports || full) {
        if (!lastUsed.has(f.id)) result.waiting++;
        continue;
      }
      const isVideo = VIDEO_TYPES.includes(f.mimeType);
      const seconds = isVideo && f.videoMediaMetadata?.durationMillis ? Number(f.videoMediaMetadata.durationMillis) / 1000 : null;
      let platforms = [hasFb && "facebook", hasIg && "instagram"].filter(Boolean) as string[];
      if (isVideo && seconds != null) {
        if (seconds < MIN_VIDEO_SECONDS) {
          result.skipped.push({ name: f.name, reason: `video is ${seconds.toFixed(1)}s — stories need at least 3s` });
          continue;
        }
        if (seconds > FB_STORY_MAX_SECONDS) platforms = platforms.filter((p) => p !== "facebook");
        if (seconds > IG_STORY_MAX_SECONDS) platforms = platforms.filter((p) => p !== "instagram");
      }
      if (Number(f.size ?? 0) > IG_STORY_MAX_BYTES) platforms = platforms.filter((p) => p !== "instagram");
      if (isVideo) {
        if (!platforms.length) {
          result.skipped.push({
            name: f.name,
            reason:
              seconds != null && seconds > FB_STORY_MAX_SECONDS
                ? `video is ${Math.round(seconds)}s${Number(f.size ?? 0) > IG_STORY_MAX_BYTES ? ` and ${Math.round(Number(f.size) / 1e6)} MB` : ""} — too long for Facebook and too big/long for Instagram; trim or compress it`
                : "not accepted by Facebook or Instagram",
          });
          continue;
        }
      }
      const at = slots.next();
      if (at.done) {
        full = true;
        if (!lastUsed.has(f.id)) result.waiting++;
        continue;
      }
      processed++;
      try {
        const ext = f.mimeType === "video/quicktime" ? "mov" : f.mimeType.split("/")[1].replace("jpeg", "jpg");
        const mediaKey = `planner/${projectId}/drive-stories/${f.id}.${ext}`;
        await uploadObject(mediaKey, await downloadFile(f.id, key), f.mimeType);
        const { error } = await db.from("scheduled_posts").insert({
          project_id: projectId,
          media_key: mediaKey,
          original_filename: f.name,
          scheduled_at: at.value,
          caption: null,
          status: "scheduled",
          post_type: "story",
          target_platforms: platforms,
          drive_file_id: f.id,
        });
        if (error) throw new Error(error.message);
        result.imported++;
      } catch (error) {
        result.skipped.push({ name: f.name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  await db.from("story_drive_sources").update({ last_synced_at: result.at, last_result: result }).eq("project_id", projectId);
  return result;
}

/** Cron: sync every folder not synced in the last hour, within a time budget. */
export async function syncDueStoryFolders(budgetMs: number): Promise<number> {
  const started = Date.now();
  const { data } = await db
    .from("story_drive_sources")
    .select("project_id, last_synced_at")
    .or(`last_synced_at.is.null,last_synced_at.lt.${new Date(Date.now() - 55 * 60_000).toISOString()}`);
  let synced = 0;
  for (const row of data ?? []) {
    if (Date.now() - started > budgetMs) break;
    await syncStoryFolder(row.project_id as string, 4);
    synced++;
  }
  return synced;
}
