import "server-only";
import { db } from "./dashboard/db";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * YouTube channel management for one project's connected channel: the
 * growth/revenue report (YouTube Analytics API), video SEO (titles,
 * descriptions, tags), comment replies, and a channel audit. Everything
 * runs on the channel owner's own grant (lib/social-youtube.ts).
 *
 * Quota (10,000 units a day for the whole Google project): reads cost 1
 * unit, a video update or a comment reply 50, an upload 1,600.
 */

const DATA = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2";

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason as string | undefined;
    const message = (json?.error?.message as string | undefined) || `YouTube API error (HTTP ${res.status})`;
    throw new Error(reason === "insufficientPermissions" || (res.status === 403 && /scope|permission/i.test(message))
      ? "This channel was connected before this feature existed — reconnect it from Connections to allow it."
      : message);
  }
  return json as T;
}

export async function projectYouTubeAccount(projectId: string): Promise<ClientSocialAccount | null> {
  const { data } = await db
    .from("client_social_accounts")
    .select("*")
    .eq("project_id", projectId)
    .eq("platform", "youtube")
    .eq("is_active", true)
    .order("created_at")
    .limit(1);
  return ((data ?? [])[0] as ClientSocialAccount | undefined) ?? null;
}

// ── Channel ─────────────────────────────────────────────────────────────

export type ChannelDetails = {
  id: string;
  title: string;
  description: string;
  customUrl: string | null;
  thumbnail: string | null;
  country: string | null;
  publishedAt: string;
  keywords: string | null;
  hasTrailer: boolean;
  hasBanner: boolean;
  subscribers: number | null;
  views: number;
  videos: number;
  uploadsPlaylist: string | null;
  madeForKids: boolean | null;
};

type ChannelItem = {
  id: string;
  snippet: { title: string; description?: string; customUrl?: string; country?: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; viewCount?: string; videoCount?: string };
  brandingSettings?: { channel?: { keywords?: string; unsubscribedTrailer?: string }; image?: { bannerExternalUrl?: string } };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  status?: { madeForKids?: boolean };
};

export async function channelDetails(token: string, channelId: string): Promise<ChannelDetails> {
  const json = await call<{ items?: ChannelItem[] }>(
    token,
    `${DATA}/channels?part=snippet,statistics,brandingSettings,contentDetails,status&id=${encodeURIComponent(channelId)}`
  );
  const c = json.items?.[0];
  if (!c) throw new Error("YouTube didn't return this channel.");
  const s = c.statistics;
  return {
    id: c.id,
    title: c.snippet.title,
    description: c.snippet.description ?? "",
    customUrl: c.snippet.customUrl ?? null,
    thumbnail: c.snippet.thumbnails?.medium?.url ?? c.snippet.thumbnails?.default?.url ?? null,
    country: c.snippet.country ?? null,
    publishedAt: c.snippet.publishedAt,
    keywords: c.brandingSettings?.channel?.keywords ?? null,
    hasTrailer: Boolean(c.brandingSettings?.channel?.unsubscribedTrailer),
    hasBanner: Boolean(c.brandingSettings?.image?.bannerExternalUrl),
    subscribers: s && !s.hiddenSubscriberCount && s.subscriberCount != null ? Number(s.subscriberCount) : null,
    views: Number(s?.viewCount ?? 0),
    videos: Number(s?.videoCount ?? 0),
    uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads ?? null,
    madeForKids: c.status?.madeForKids ?? null,
  };
}

// ── Videos ──────────────────────────────────────────────────────────────

export type ChannelVideo = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  publishedAt: string;
  thumbnail: string | null;
  durationSeconds: number;
  isShort: boolean;
  privacy: string;
  hasCaptions: boolean;
  views: number;
  likes: number;
  comments: number;
};

/** ISO 8601 duration ("PT1H2M3S") → seconds. */
function isoSeconds(d: string): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d) ?? [];
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

type VideoItem = {
  id: string;
  snippet: { title: string; description: string; tags?: string[]; categoryId: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
  contentDetails: { duration: string; caption: string };
  status: { privacyStatus: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

function toVideo(v: VideoItem): ChannelVideo {
  const seconds = isoSeconds(v.contentDetails.duration);
  return {
    id: v.id,
    title: v.snippet.title,
    description: v.snippet.description ?? "",
    tags: v.snippet.tags ?? [],
    categoryId: v.snippet.categoryId,
    publishedAt: v.snippet.publishedAt,
    thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
    durationSeconds: seconds,
    // YouTube doesn't flag Shorts in the API; up to 3 minutes is the rule of thumb.
    isShort: seconds > 0 && seconds <= 180,
    privacy: v.status.privacyStatus,
    hasCaptions: v.contentDetails.caption === "true",
    views: Number(v.statistics?.viewCount ?? 0),
    likes: Number(v.statistics?.likeCount ?? 0),
    comments: Number(v.statistics?.commentCount ?? 0),
  };
}

/** The channel's latest uploads (newest first), up to `max`. */
export async function listChannelVideos(token: string, uploadsPlaylist: string, max = 50): Promise<ChannelVideo[]> {
  const ids: string[] = [];
  let pageToken = "";
  while (ids.length < max) {
    const page = await call<{ items?: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
      token,
      `${DATA}/playlistItems?part=contentDetails&maxResults=50&playlistId=${encodeURIComponent(uploadsPlaylist)}${pageToken ? `&pageToken=${pageToken}` : ""}`
    );
    ids.push(...(page.items ?? []).map((i) => i.contentDetails.videoId));
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  const out: ChannelVideo[] = [];
  for (let i = 0; i < Math.min(ids.length, max); i += 50) {
    const batch = ids.slice(i, i + 50);
    const json = await call<{ items?: VideoItem[] }>(token, `${DATA}/videos?part=snippet,contentDetails,status,statistics&id=${batch.join(",")}`);
    out.push(...(json.items ?? []).map(toVideo));
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** Updates a video's title, description and tags (50 quota units). The
 *  rest of the snippet (category, language) is kept as it is. */
export async function updateVideoSeo(token: string, videoId: string, seo: { title: string; description: string; tags: string[] }) {
  const title = seo.title.replace(/[<>]/g, "").trim();
  if (!title || title.length > 100) throw new Error("A YouTube title must be 1–100 characters.");
  if (seo.description.length > 5000) throw new Error("A YouTube description can be at most 5,000 characters.");
  if (seo.tags.join(",").length > 500) throw new Error("YouTube allows about 500 characters of tags in total — remove a few.");
  const current = await call<{ items?: VideoItem[] }>(token, `${DATA}/videos?part=snippet&id=${encodeURIComponent(videoId)}`);
  const snippet = current.items?.[0]?.snippet;
  if (!snippet) throw new Error("This video isn't on the channel any more.");
  await call(token, `${DATA}/videos?part=snippet`, {
    method: "PUT",
    body: JSON.stringify({
      id: videoId,
      snippet: { ...snippet, title, description: seo.description.replace(/[<>]/g, ""), tags: seo.tags, categoryId: snippet.categoryId },
    }),
  });
}

/** Simple, explainable SEO checks for one video — what to fix, in order. */
export function videoSeoChecks(v: ChannelVideo): string[] {
  const tips: string[] = [];
  if (v.title.length < 20) tips.push("Title is very short — say what the video is about, with the main keyword first.");
  if (v.title.length > 70) tips.push("Title is over 70 characters — the end gets cut off in search.");
  if (v.description.length < 125) tips.push("Description is under 125 characters — the first 2 lines show in search, so add a real summary.");
  if (!v.isShort && !/\d{1,2}:\d{2}/.test(v.description)) tips.push("No chapters — add timestamps (0:00 Intro …) for a long video.");
  if (v.tags.length === 0) tips.push("No tags — add 5–10 (brand, city, topic).");
  if (!/https?:\/\//.test(v.description)) tips.push("No link in the description — add the website or booking link.");
  if (!/#\w+/.test(v.description)) tips.push("No hashtags — add 2–3 at the end of the description.");
  if (!v.isShort && !v.hasCaptions) tips.push("No captions — upload subtitles (Urdu/English) for reach and accessibility.");
  return tips;
}

// ── Comments ────────────────────────────────────────────────────────────

export type ChannelComment = {
  threadId: string;
  /** The top-level comment's id — what a reply's parentId must be. */
  commentId: string;
  videoId: string;
  author: string;
  authorChannelId: string | null;
  text: string;
  publishedAt: string;
  likes: number;
  replies: { author: string; text: string; byChannel: boolean }[];
  /** The channel has already answered in this thread. */
  answered: boolean;
};

type ThreadItem = {
  id: string;
  snippet: {
    videoId?: string;
    totalReplyCount: number;
    topLevelComment: { id: string; snippet: { authorDisplayName: string; authorChannelId?: { value: string }; textOriginal: string; publishedAt: string; likeCount: number } };
  };
  replies?: { comments: { snippet: { authorDisplayName: string; authorChannelId?: { value: string }; textOriginal: string } }[] };
};

/** The newest comment threads across the whole channel. */
export async function listChannelComments(token: string, channelId: string, max = 50): Promise<ChannelComment[]> {
  const json = await call<{ items?: ThreadItem[] }>(
    token,
    `${DATA}/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${encodeURIComponent(channelId)}&order=time&maxResults=${Math.min(max, 100)}&textFormat=plainText`
  );
  return (json.items ?? [])
    .map((t) => {
      const top = t.snippet.topLevelComment.snippet;
      const replies = (t.replies?.comments ?? []).map((r) => ({
        author: r.snippet.authorDisplayName,
        text: r.snippet.textOriginal,
        byChannel: r.snippet.authorChannelId?.value === channelId,
      }));
      return {
        threadId: t.id,
        commentId: t.snippet.topLevelComment.id,
        videoId: t.snippet.videoId ?? "",
        author: top.authorDisplayName,
        authorChannelId: top.authorChannelId?.value ?? null,
        text: top.textOriginal,
        publishedAt: top.publishedAt,
        likes: top.likeCount,
        replies,
        answered: replies.some((r) => r.byChannel),
      };
    })
    // The channel's own top-level comments don't need an answer.
    .filter((c) => c.authorChannelId !== channelId);
}

/** Posts the channel's reply to a top-level comment (50 quota units). */
export async function replyToComment(token: string, parentId: string, text: string) {
  const body = text.trim();
  if (!body) throw new Error("Write a reply first.");
  if (body.length > 10000) throw new Error("A reply can be at most 10,000 characters.");
  await call(token, `${DATA}/comments?part=snippet`, { method: "POST", body: JSON.stringify({ snippet: { parentId, textOriginal: body } }) });
}

// ── Analytics (growth + revenue) ────────────────────────────────────────

type ReportRows = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };

async function report(token: string, params: Record<string, string>): Promise<{ header: string[]; rows: (string | number)[][] }> {
  const q = new URLSearchParams({ ids: "channel==MINE", ...params });
  const json = await call<ReportRows>(token, `${ANALYTICS}/reports?${q.toString()}`);
  return { header: (json.columnHeaders ?? []).map((h) => h.name), rows: json.rows ?? [] };
}

export type GrowthReport = {
  from: string;
  to: string;
  totals: { views: number; watchHours: number; avgViewSeconds: number; subscribersGained: number; subscribersLost: number; likes: number; comments: number; shares: number };
  previous: { views: number; watchHours: number; subscribersNet: number };
  daily: { day: string; views: number; subscribersNet: number }[];
  traffic: { source: string; views: number }[];
  topVideos: { videoId: string; views: number; watchHours: number }[];
  countries: { country: string; views: number }[];
  /** null = not monetized, or the revenue scope wasn't granted. */
  revenue: { estimated: number; currency: "USD" } | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

const TRAFFIC_NAMES: Record<string, string> = {
  YT_SEARCH: "YouTube search",
  SUBSCRIBER: "Subscribers / browse",
  YT_CHANNEL: "Channel page",
  SHORTS: "Shorts feed",
  RELATED_VIDEO: "Suggested videos",
  EXT_URL: "External sites",
  YT_OTHER_PAGE: "Other YouTube pages",
  NO_LINK_OTHER: "Direct / unknown",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  YT_PLAYLIST_PAGE: "Playlist pages",
  END_SCREEN: "End screens",
  ADVERTISING: "YouTube ads",
  HASHTAGS: "Hashtag pages",
  SOUND_PAGE: "Sound pages",
};

/** Last `days` days (ending yesterday — YouTube's data lags a day or two) vs the period before. */
export async function growthReport(token: string, days = 28): Promise<GrowthReport> {
  const end = new Date(Date.now() - 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const range = { startDate: day(start), endDate: day(end) };
  const metrics = "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares";

  const [totals, prev, daily, traffic, top, countries] = await Promise.all([
    report(token, { ...range, metrics }),
    report(token, { startDate: day(prevStart), endDate: day(prevEnd), metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost" }),
    report(token, { ...range, metrics: "views,subscribersGained,subscribersLost", dimensions: "day", sort: "day" }),
    report(token, { ...range, metrics: "views", dimensions: "insightTrafficSourceType", sort: "-views" }),
    report(token, { ...range, metrics: "views,estimatedMinutesWatched", dimensions: "video", sort: "-views", maxResults: "10" }),
    report(token, { ...range, metrics: "views", dimensions: "country", sort: "-views", maxResults: "8" }),
  ]);
  const t = totals.rows[0] ?? [];
  const p = prev.rows[0] ?? [];

  let revenue: GrowthReport["revenue"] = null;
  try {
    const r = await report(token, { ...range, metrics: "estimatedRevenue" });
    const value = Number(r.rows[0]?.[0] ?? 0);
    revenue = { estimated: value, currency: "USD" };
  } catch {
    revenue = null;
  }

  return {
    from: range.startDate,
    to: range.endDate,
    totals: {
      views: Number(t[0] ?? 0),
      watchHours: Number(t[1] ?? 0) / 60,
      avgViewSeconds: Number(t[2] ?? 0),
      subscribersGained: Number(t[3] ?? 0),
      subscribersLost: Number(t[4] ?? 0),
      likes: Number(t[5] ?? 0),
      comments: Number(t[6] ?? 0),
      shares: Number(t[7] ?? 0),
    },
    previous: { views: Number(p[0] ?? 0), watchHours: Number(p[1] ?? 0) / 60, subscribersNet: Number(p[2] ?? 0) - Number(p[3] ?? 0) },
    daily: daily.rows.map((r) => ({ day: String(r[0]), views: Number(r[1]), subscribersNet: Number(r[2]) - Number(r[3]) })),
    traffic: traffic.rows.map((r) => ({ source: TRAFFIC_NAMES[String(r[0])] ?? String(r[0]), views: Number(r[1]) })),
    topVideos: top.rows.map((r) => ({ videoId: String(r[0]), views: Number(r[1]), watchHours: Number(r[2]) / 60 })),
    countries: countries.rows.map((r) => ({ country: String(r[0]), views: Number(r[1]) })),
    revenue,
  };
}

// ── Channel audit ───────────────────────────────────────────────────────

export type AuditItem = { area: string; ok: boolean; finding: string; fix: string };

/** A plain checklist from the channel and its latest uploads. */
export function auditChannel(channel: ChannelDetails, videos: ChannelVideo[]): { score: number; items: AuditItem[] } {
  const now = Date.now();
  const last30 = videos.filter((v) => now - new Date(v.publishedAt).getTime() < 30 * 86400000);
  const longs = videos.filter((v) => !v.isShort);
  const shorts = videos.filter((v) => v.isShort);
  const noTags = videos.filter((v) => v.tags.length === 0).length;
  const thinDesc = videos.filter((v) => v.description.length < 125).length;
  const longNoCaptions = longs.filter((v) => !v.hasCaptions).length;
  const avgViews = videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0;
  const engagement = videos.reduce((s, v) => s + v.views, 0)
    ? (videos.reduce((s, v) => s + v.likes + v.comments, 0) / videos.reduce((s, v) => s + v.views, 0)) * 100
    : 0;
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const items: AuditItem[] = [
    {
      area: "Channel description",
      ok: channel.description.length >= 300,
      finding: channel.description ? `${channel.description.length} characters.` : "Empty.",
      fix: "Write 300+ characters: who you are, what's on the channel, the city, and the website/booking link. Put the main keywords in the first 2 lines.",
    },
    {
      area: "Channel keywords",
      ok: Boolean(channel.keywords && channel.keywords.length > 20),
      finding: channel.keywords ? channel.keywords.slice(0, 120) : "None set.",
      fix: "Add 8–15 keywords in YouTube Studio → Settings → Channel (brand, city, services).",
    },
    {
      area: "Handle / custom URL",
      ok: Boolean(channel.customUrl),
      finding: channel.customUrl ?? "No handle.",
      fix: "Pick a short @handle that matches the brand name in YouTube Studio → Customization → Basic info.",
    },
    {
      area: "Banner",
      ok: channel.hasBanner,
      finding: channel.hasBanner ? "Set." : "No banner.",
      fix: "Upload a 2560×1440 banner with the logo, tagline and contact line inside the 1546×423 safe area.",
    },
    {
      area: "Channel trailer",
      ok: channel.hasTrailer,
      finding: channel.hasTrailer ? "Set for new visitors." : "No trailer.",
      fix: "Set a 30–60 second trailer for visitors who haven't subscribed (Customization → Layout).",
    },
    {
      area: "Upload consistency",
      ok: last30.length >= 4,
      finding: `${last30.length} upload${last30.length === 1 ? "" : "s"} in the last 30 days.`,
      fix: "Aim for at least 1 long video or 3 Shorts a week, on fixed days.",
    },
    {
      area: "Shorts + long videos mix",
      ok: shorts.length > 0 && longs.length > 0,
      finding: `${shorts.length} Shorts, ${longs.length} long videos (latest ${videos.length}).`,
      fix: "Use Shorts to reach new people and long videos to build watch time — post both.",
    },
    {
      area: "Tags",
      ok: pct(noTags, videos.length) <= 20,
      finding: `${noTags} of ${videos.length} videos have no tags (${pct(noTags, videos.length)}%).`,
      fix: "Add 5–10 tags to each video from the Videos tab.",
    },
    {
      area: "Descriptions",
      ok: pct(thinDesc, videos.length) <= 20,
      finding: `${thinDesc} of ${videos.length} videos have a description under 125 characters.`,
      fix: "Give every video a 2-line summary with keywords, a link and 2–3 hashtags (Videos tab).",
    },
    {
      area: "Captions on long videos",
      ok: longs.length === 0 || pct(longNoCaptions, longs.length) <= 30,
      finding: longs.length ? `${longNoCaptions} of ${longs.length} long videos have no captions.` : "No long videos.",
      fix: "Upload Urdu/English subtitles — they help search and viewers watching without sound.",
    },
    {
      area: "Engagement",
      ok: engagement >= 3,
      finding: `${engagement.toFixed(1)}% likes + comments per view; ${avgViews.toLocaleString()} average views per video.`,
      fix: "Ask a question in each video and pin a comment; reply to comments within a day (Comments tab).",
    },
    {
      area: "Made for kids",
      ok: channel.madeForKids !== true,
      finding: channel.madeForKids ? "Channel is set as made for kids — comments and personalised ads are off." : "Not set as made for kids.",
      fix: "Only mark content for kids if it really is; it turns off comments and notifications.",
    },
  ];
  const score = Math.round((items.filter((i) => i.ok).length / items.length) * 100);
  return { score, items };
}
