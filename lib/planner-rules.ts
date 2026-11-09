import type { PostType } from "./dashboard/types";

/**
 * Planner rules shared by the dashboard, the Drive import and the MCP tools,
 * so a post added from ChatGPT or Claude meets the same checks as one added
 * by hand: which platform takes which kind of post, how long a video may be,
 * and which days a batch of posts lands on.
 */

/** Platforms that take each kind besides a photo post. YouTube takes no photos. */
const KIND_PLATFORMS: Record<Exclude<PostType, "post">, string[]> = {
  reel: ["facebook", "instagram", "youtube", "tiktok"],
  video: ["youtube", "facebook", "tiktok"],
  story: ["facebook", "instagram"],
};
const VIDEO_ONLY_PLATFORMS = ["youtube"];

export const takes = (kind: PostType, platform: string) =>
  kind === "post" ? !VIDEO_ONLY_PLATFORMS.includes(platform) : KIND_PLATFORMS[kind].includes(platform);

/** Video length each platform takes, in seconds, per kind (the composer's own limits). */
const VIDEO_SECONDS: Record<PostType, Record<string, [number, number]>> = {
  post: {},
  reel: { facebook: [3, 90], instagram: [3, 900], youtube: [0, 180], tiktok: [0, 600] },
  story: { facebook: [3, 60], instagram: [3, 60] },
  video: { youtube: [0, 900], tiktok: [0, 600] },
};

const NAMES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };
const KIND_NAMES: Record<PostType, string> = { post: "posts", reel: "Reels", story: "Stories", video: "videos" };

/** Why a video of `seconds` doesn't fit `platform` as this kind, or null when it does (or the length is unknown). */
export function lengthProblem(kind: PostType, platform: string, seconds: number | null): string | null {
  const limits = VIDEO_SECONDS[kind][platform];
  if (!limits || seconds === null || (seconds >= limits[0] && seconds <= limits[1])) return null;
  const range = limits[0] > 0 ? `${limits[0]}–${limits[1]} seconds` : `up to ${limits[1]} seconds`;
  return `${NAMES[platform] ?? platform} ${KIND_NAMES[kind]} must be ${range}; this video is ${Math.round(seconds)} seconds.`;
}

export const lengthFits = (kind: PostType, platform: string, seconds: number | null) => lengthProblem(kind, platform, seconds) === null;

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 5=Fri … 6=Sat
}

/** One free day per file from `startDate` on. Fridays are kept for files with
 *  "friday" in the name (Jummah posts); other files skip them. */
export function planBulkDates(fileNames: string[], startDate: string, occupiedDates: Set<string>): string[] {
  const fridayIdx: number[] = [];
  const otherIdx: number[] = [];
  fileNames.forEach((name, i) => (/friday/i.test(name) ? fridayIdx : otherIdx).push(i));

  const dates = new Array<string>(fileNames.length);
  let cursor = startDate;
  let fi = 0;
  let oi = 0;
  while (fi < fridayIdx.length || oi < otherIdx.length) {
    if (!occupiedDates.has(cursor)) {
      if (dayOfWeek(cursor) === 5) {
        if (fi < fridayIdx.length) dates[fridayIdx[fi++]] = cursor;
        // else: leave this Friday empty rather than using a regular file.
      } else if (oi < otherIdx.length) {
        dates[otherIdx[oi++]] = cursor;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** Today's date in Pakistan (UTC+5, no DST), "YYYY-MM-DD". */
export const pktToday = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
export const pktTomorrow = () => addDays(pktToday(), 1);
