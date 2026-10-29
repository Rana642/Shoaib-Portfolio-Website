import "server-only";
import { GRAPH_BASE } from "./social-fb";
import { listSocialAccountsForProject, decryptAccountToken } from "./social-accounts";
import { IG_LOGIN_GRAPH_BASE, getFreshInstagramLoginToken, isInstagramLoginAccount } from "./social-instagram-login";
import {
  getImageUrls,
  getOrganizationFollowers,
  getOrganizationShareTotals,
  getPostShareStats,
  listOrganizationPosts,
  type LinkedInShareStats,
} from "./social-linkedin";
import type { ClientSocialAccount, SocialPlatform } from "./dashboard/types";
import type { InsightRange, TrendPoint } from "./social-insights-shared";

/**
 * Read-only Page / Instagram insights for the /dashboard/social/insights
 * view. Metric names here were verified against the live Graph API (v26),
 * not taken from older docs — Meta retired page_impressions, page_fans,
 * page_engaged_users, post_impressions etc.; "views" (page_media_view) and
 * "viewers" (page_total_media_view_unique) are their replacements.
 */

// Meta only refreshes most insights about once a day, so re-asking on every
// page view buys nothing and burns rate limit — each Graph response is
// cached for 30 minutes. `now` is snapped to the hour (anchorNow) so the
// since/until in the URL — part of the cache key — stays stable.
const REVALIDATE_SECONDS = 1800;
const DAY = 86400;
// Meta rejects any Instagram insights request spanning more than 30 days, so
// longer ranges are fetched as consecutive 30-day windows.
const IG_MAX_WINDOW = 30 * DAY;

type GraphError = { error?: { message?: string } };
type Window = { since: number; until: number };
type DailyValue = { value: number | Record<string, number>; end_time: string };
type InsightRow = { name: string; period: string; values: DailyValue[] };

async function graphGet<T>(path: string, params: Record<string, string>, base = GRAPH_BASE): Promise<T> {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  const body = (await res.json()) as T & GraphError;
  if (!res.ok || body.error) throw new Error(body.error?.message || `Graph API error (HTTP ${res.status})`);
  return body;
}

function anchorNow(): number {
  return Math.floor(Date.now() / 1000 / 3600) * 3600;
}

/** [now - offset - range, now - offset], split into ≤maxSpan windows. */
function windowsFor(rangeDays: number, offsetDays: number, maxSpan?: number): Window[] {
  const until = anchorNow() - offsetDays * DAY;
  const since = until - rangeDays * DAY;
  const span = maxSpan ?? until - since;
  const out: Window[] = [];
  for (let s = since; s < until; s += span) out.push({ since: s, until: Math.min(until, s + span) });
  return out;
}

/** Meta stamps each daily value with the END of the day it covers. */
function dayCovered(endTime: string): string {
  const d = new Date(endTime);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function toSeries(values: DailyValue[] | undefined): TrendPoint[] {
  const byDate = new Map<string, number>();
  for (const v of values ?? []) byDate.set(dayCovered(v.end_time), typeof v.value === "number" ? v.value : 0);
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

const sumOf = (points: TrendPoint[]) => points.reduce((sum, p) => sum + p.value, 0);

// ── Best posting times ───────────────────────────────────────
// Meta retired every audience-online-time metric (page_fans_online,
// audience_gender_age, etc. — confirmed by live probe, not docs) years ago,
// so there's no direct "when are my followers online" answer left. The
// honest substitute: look at when THIS account's own past posts actually
// reached people, using data we already fetch per post. Reach (not views)
// is the metric, since that's the organic-reach question being asked.

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// 4-hour PKT slots — narrow enough to be actionable, wide enough that a
// month of posts doesn't scatter to 1-2 per bucket.
const HOUR_SLOTS: { label: string; start: number }[] = [
  { label: "12–4 AM", start: 0 },
  { label: "4–8 AM", start: 4 },
  { label: "8 AM–12 PM", start: 8 },
  { label: "12–4 PM", start: 12 },
  { label: "4–8 PM", start: 16 },
  { label: "8 PM–12 AM", start: 20 },
];
const PKT_OFFSET_MS = 5 * 3600 * 1000;
const MIN_POSTS_FOR_ANALYSIS = 8;

export type TimeBucket = { label: string; medianReach: number; count: number };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
export type PostingTimeAnalysis = {
  byDayOfWeek: TimeBucket[];
  byHour: TimeBucket[];
  sampleSize: number;
  /** Below MIN_POSTS_FOR_ANALYSIS, the split gets too noisy to act on. */
  reliable: boolean;
};

function pktParts(dateIso: string): { day: number; hour: number } {
  const shifted = new Date(new Date(dateIso).getTime() + PKT_OFFSET_MS);
  return { day: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

// Median, not mean — a single viral post otherwise dominates its whole
// day/hour bucket and makes one lucky post look like a pattern (seen live:
// one 38k-reach outlier made a client's Thursday average 45x its other
// days). Median reflects what a typical post in that slot actually gets.
function bucketMedians<K>(posts: PostRow[], keyOf: (p: PostRow) => K, labelOf: (k: K) => string, order: K[]): TimeBucket[] {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const key = String(keyOf(p));
    const reach = p.reach || p.views;
    groups.set(key, [...(groups.get(key) ?? []), reach]);
  }
  return order
    .map((k) => {
      const values = groups.get(String(k)) ?? [];
      return { label: labelOf(k), medianReach: median(values), count: values.length };
    })
    .sort((a, b) => b.medianReach - a.medianReach);
}

function analyzePostingTimes(posts: PostRow[]): PostingTimeAnalysis {
  const byDayOfWeek = bucketMedians(
    posts,
    (p) => pktParts(p.date).day,
    (d) => WEEKDAY_LABELS[d],
    [0, 1, 2, 3, 4, 5, 6]
  );
  const byHour = bucketMedians(
    posts,
    (p) => {
      const hour = pktParts(p.date).hour;
      let slot = HOUR_SLOTS[0].start;
      for (const s of HOUR_SLOTS) if (hour >= s.start) slot = s.start;
      return slot;
    },
    (start) => HOUR_SLOTS.find((s) => s.start === start)!.label,
    HOUR_SLOTS.map((s) => s.start)
  );
  return { byDayOfWeek, byHour, sampleSize: posts.length, reliable: posts.length >= MIN_POSTS_FOR_ANALYSIS };
}

export type PostRow = {
  id: string;
  date: string;
  text: string;
  image: string | null;
  url: string | null;
  views: number;
  reach: number;
  /** Facebook: all reaction types. Instagram: likes. */
  reactions: number;
  comments: number;
  shares: number;
  /** Facebook: link clicks. Instagram: saves. */
  extra: number;
  /** Instagram only: what kind of post it is. */
  format?: PostFormat;
  /** Facebook only: views that came from ads (then `views` is organic only);
   *  null when Meta didn't split this post. Instagram post figures are
   *  organic-only at the source. */
  adViews?: number | null;
};

export type PostFormat = "reel" | "video" | "carousel" | "image";

/** Per-format totals for one account's posts in the period (Reels vs carousels vs images). */
export type FormatSummary = { format: PostFormat; posts: number; avgLikes: number; avgComments: number; avgViews: number };

function summarizeFormats(posts: PostRow[]): FormatSummary[] {
  const order: PostFormat[] = ["reel", "video", "carousel", "image"];
  return order
    .map((format) => {
      const list = posts.filter((p) => p.format === format);
      const avg = (k: "reactions" | "comments" | "views") =>
        list.length ? Math.round(list.reduce((s, p) => s + p[k], 0) / list.length) : 0;
      return { format, posts: list.length, avgLikes: avg("reactions"), avgComments: avg("comments"), avgViews: avg("views") };
    })
    .filter((f) => f.posts > 0);
}

// ── Facebook ──────────────────────────────────────────────────

const FB_DAILY_METRICS = [
  "page_media_view",
  "page_total_media_view_unique",
  "page_post_engagements",
  "page_views_total",
  "page_video_views",
  "page_follows",
  "page_daily_follows_unique",
  "page_daily_unfollows_unique",
  "page_actions_post_reactions_total",
];

const REACTION_LABELS: Record<string, string> = {
  like: "Like",
  love: "Love",
  care: "Care",
  wow: "Wow",
  haha: "Haha",
  sorry: "Sad",
  anger: "Angry",
};

// Organic vs paid (verified against the live API, 2026-10-14): Page views
// and video views include ads unless split. page_media_view takes
// breakdown=is_from_ads and answers with one value per day per side
// ({ value, end_time, is_from_ads: "0" | "1" }; zero days are left out), as
// does post_media_view per post. Video views have their own paid/organic
// metrics. When Meta won't split, the totals show with ads included.
type FbTotals = {
  /** Organic when `adViews` isn't null; otherwise organic + ads. */
  views: number;
  adViews: number | null;
  engagements: number;
  pageVisits: number;
  /** Organic when `adVideoViews` isn't null; otherwise organic + ads. */
  videoViews: number;
  adVideoViews: number | null;
  /** De-duplicated viewers across the whole range — 7/28-day ranges only. */
  viewers: number | null;
  avgDailyViewers: number;
  netFollows: number;
};

/** Where the Page's followers are — Meta gives country and city only (age,
 *  gender and language left the API with the page_fans_* metrics). */
export type FbAudience = {
  country: { label: string; value: number }[];
  city: { label: string; value: number }[];
  total: number;
};

export type FacebookInsights = {
  platform: "facebook";
  label: string;
  followers: number | null;
  /** Null when Meta returned nothing; audienceError says why. */
  audience: FbAudience | null;
  audienceError?: string;
  current: FbTotals;
  previous: FbTotals;
  series: { views: TrendPoint[]; engagements: TrendPoint[]; followers: TrendPoint[] };
  reactions: { label: string; value: number }[];
  topPosts: PostRow[];
  postCount: number;
  postingTimes: PostingTimeAnalysis;
};

async function fbDaily(pageId: string, token: string, w: Window): Promise<Map<string, DailyValue[]>> {
  const { data } = await graphGet<{ data: InsightRow[] }>(`/${pageId}/insights`, {
    metric: FB_DAILY_METRICS.join(","),
    period: "day",
    since: String(w.since),
    until: String(w.until),
    access_token: token,
  });
  return new Map(data.filter((r) => r.period === "day").map((r) => [r.name, r.values]));
}

type SplitValue = DailyValue & { is_from_ads?: string };

/** Daily Page views split into organic and ads; null when Meta won't split. */
async function fbViewsSplit(pageId: string, token: string, w: Window): Promise<{ organic: TrendPoint[]; ads: TrendPoint[] } | null> {
  try {
    const { data } = await graphGet<{ data: { name: string; period: string; values: SplitValue[] }[] }>(`/${pageId}/insights`, {
      metric: "page_media_view",
      breakdown: "is_from_ads",
      period: "day",
      since: String(w.since),
      until: String(w.until),
      access_token: token,
    });
    const values = data.find((r) => r.name === "page_media_view" && r.period === "day")?.values ?? [];
    if (values.length && !values.some((v) => v.is_from_ads !== undefined)) return null;
    return {
      organic: toSeries(values.filter((v) => v.is_from_ads === "0")),
      ads: toSeries(values.filter((v) => v.is_from_ads === "1")),
    };
  } catch {
    return null;
  }
}

/** Video views (3 s+) split into organic and promoted; null when unavailable. */
async function fbVideoSplit(pageId: string, token: string, w: Window): Promise<{ organic: number; ads: number } | null> {
  try {
    const { data } = await graphGet<{ data: InsightRow[] }>(`/${pageId}/insights`, {
      metric: "page_video_views_organic,page_video_views_paid",
      period: "day",
      since: String(w.since),
      until: String(w.until),
      access_token: token,
    });
    const total = (name: string) => sumOf(toSeries(data.find((r) => r.name === name && r.period === "day")?.values));
    return { organic: total("page_video_views_organic"), ads: total("page_video_views_paid") };
  } catch {
    return null;
  }
}

/** Per-post organic / ad views, one request per post (Meta has no bulk form
 *  for a broken-down post metric). Posts Meta won't split are left out. */
async function fbPostSplit(postIds: string[], token: string): Promise<Map<string, { organic: number; ads: number }>> {
  const out = new Map<string, { organic: number; ads: number }>();
  await Promise.all(
    postIds.map(async (id) => {
      try {
        const { data } = await graphGet<{ data: { name: string; values: SplitValue[] }[] }>(`/${id}/insights`, {
          metric: "post_media_view",
          breakdown: "is_from_ads",
          access_token: token,
        });
        const values = data.find((r) => r.name === "post_media_view")?.values ?? [];
        if (!values.some((v) => v.is_from_ads !== undefined)) return;
        const side = (flag: string) => values.filter((v) => v.is_from_ads === flag).reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
        out.set(id, { organic: side("0"), ads: side("1") });
      } catch {
        /* this post keeps its combined total */
      }
    })
  );
  return out;
}

/** Only Meta's own week / 28-day rollups give a true de-duplicated viewer
 *  count — adding up daily uniques would count a repeat viewer every day. */
async function fbUniqueViewers(pageId: string, token: string, rangeDays: InsightRange, until: number): Promise<number | null> {
  const period = rangeDays === 7 ? "week" : rangeDays === 28 ? "days_28" : null;
  if (!period) return null;
  const { data } = await graphGet<{ data: InsightRow[] }>(`/${pageId}/insights`, {
    metric: "page_total_media_view_unique",
    period,
    since: String(until - DAY),
    until: String(until),
    access_token: token,
  });
  const last = data?.[0]?.values?.at(-1)?.value;
  return typeof last === "number" ? last : null;
}

type FbPostApi = {
  id: string;
  created_time: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  insights?: { data?: { name: string; values?: { value?: unknown }[] }[] };
};

async function fbPosts(pageId: string, token: string, w: Window): Promise<PostRow[]> {
  const { data } = await graphGet<{ data: FbPostApi[] }>(`/${pageId}/published_posts`, {
    fields:
      "id,created_time,message,full_picture,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),insights.metric(post_media_view,post_total_media_view_unique,post_clicks)",
    since: String(w.since),
    until: String(w.until),
    limit: "100",
    access_token: token,
  });
  return data.map((p) => {
    const metric = (name: string) =>
      Math.max(
        0,
        ...(p.insights?.data ?? [])
          .filter((d) => d.name === name)
          .map((d) => (typeof d.values?.[0]?.value === "number" ? (d.values[0].value as number) : 0))
      );
    return {
      id: p.id,
      date: p.created_time,
      text: p.message ?? "",
      image: p.full_picture ?? null,
      url: p.permalink_url ?? null,
      views: metric("post_media_view"),
      reach: metric("post_total_media_view_unique"),
      reactions: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
      extra: metric("post_clicks"),
    };
  });
}

function fbTotals(
  daily: Map<string, DailyValue[]>,
  viewers: number | null,
  views: { organic: TrendPoint[]; ads: TrendPoint[] } | null,
  video: { organic: number; ads: number } | null
): FbTotals {
  const s = (name: string) => toSeries(daily.get(name));
  const dailyViewers = s("page_total_media_view_unique");
  return {
    views: views ? sumOf(views.organic) : sumOf(s("page_media_view")),
    adViews: views ? sumOf(views.ads) : null,
    engagements: sumOf(s("page_post_engagements")),
    pageVisits: sumOf(s("page_views_total")),
    videoViews: video ? video.organic : sumOf(s("page_video_views")),
    adVideoViews: video ? video.ads : null,
    viewers,
    avgDailyViewers: dailyViewers.length ? sumOf(dailyViewers) / dailyViewers.length : 0,
    netFollows: sumOf(s("page_daily_follows_unique")) - sumOf(s("page_daily_unfollows_unique")),
  };
}

/** Followers by country and city: page_follows_country / page_follows_city,
 *  Meta's replacements for page_fans_* (retired 15 Nov 2025). A daily
 *  snapshot — the latest day that has one wins. */
async function fbAudience(pageId: string, token: string): Promise<FbAudience> {
  const { data } = await graphGet<{ data: { name: string; values: { value: unknown }[] }[] }>(`/${pageId}/insights`, {
    metric: "page_follows_country,page_follows_city",
    period: "day",
    access_token: token,
  });
  const latest = (name: string): [string, number][] => {
    const values = data.find((d) => d.name === name)?.values ?? [];
    const snapshot = [...values].reverse().find((v) => typeof v.value === "object" && v.value !== null)?.value;
    return Object.entries((snapshot ?? {}) as Record<string, number>);
  };
  const top = (rows: [string, number][], label: (key: string) => string) =>
    [...rows].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([key, value]) => ({ label: label(key), value }));
  const country = latest("page_follows_country");
  return {
    country: top(country, regionName),
    city: top(latest("page_follows_city"), (key) => key.split(",")[0]),
    total: country.reduce((sum, [, n]) => sum + n, 0),
  };
}

async function facebookInsights(account: ClientSocialAccount, rangeDays: InsightRange): Promise<FacebookInsights> {
  const token = decryptAccountToken(account);
  const pageId = account.external_id;
  const [cur] = windowsFor(rangeDays, 0);
  const [prev] = windowsFor(rangeDays, rangeDays);

  const [curDaily, prevDaily, curViewers, prevViewers, allPosts, curViews, prevViews, curVideo, prevVideo] = await Promise.all([
    fbDaily(pageId, token, cur),
    fbDaily(pageId, token, prev),
    fbUniqueViewers(pageId, token, rangeDays, cur.until),
    fbUniqueViewers(pageId, token, rangeDays, prev.until),
    fbPosts(pageId, token, cur),
    fbViewsSplit(pageId, token, cur),
    fbViewsSplit(pageId, token, prev),
    fbVideoSplit(pageId, token, cur),
    fbVideoSplit(pageId, token, prev),
  ]);
  const postSplit = await fbPostSplit(
    allPosts.map((p) => p.id),
    token
  );
  const posts = allPosts.map((p) => {
    const split = postSplit.get(p.id);
    return split ? { ...p, views: split.organic, adViews: split.ads } : { ...p, adViews: null };
  });
  // Days with no organic views are left out of Meta's split — chart them as 0.
  const viewDates = toSeries(curDaily.get("page_media_view")).map((p) => p.date);
  const organicByDate = new Map((curViews?.organic ?? []).map((p) => [p.date, p.value]));

  const reactionTotals = new Map<string, number>();
  for (const v of curDaily.get("page_actions_post_reactions_total") ?? []) {
    if (typeof v.value !== "object" || v.value === null) continue;
    for (const [type, n] of Object.entries(v.value)) reactionTotals.set(type, (reactionTotals.get(type) ?? 0) + n);
  }
  const followers = toSeries(curDaily.get("page_follows"));
  const audience = await fbAudience(pageId, token).then(
    (a) => ({ audience: a.total ? a : null }),
    (error: unknown) => ({ audience: null, audienceError: error instanceof Error ? error.message : String(error) })
  );

  return {
    platform: "facebook",
    label: account.label,
    followers: followers.at(-1)?.value ?? null,
    ...audience,
    current: fbTotals(curDaily, curViewers, curViews, curVideo),
    previous: fbTotals(prevDaily, prevViewers, prevViews, prevVideo),
    series: {
      views: curViews
        ? viewDates.map((date) => ({ date, value: organicByDate.get(date) ?? 0 }))
        : toSeries(curDaily.get("page_media_view")),
      engagements: toSeries(curDaily.get("page_post_engagements")),
      followers,
    },
    reactions: [...reactionTotals]
      .map(([type, value]) => ({ label: REACTION_LABELS[type] ?? type, value }))
      .sort((a, b) => b.value - a.value),
    topPosts: [...posts].sort((a, b) => b.views - a.views),
    postCount: posts.length,
    postingTimes: analyzePostingTimes(posts),
  };
}

// ── Instagram ─────────────────────────────────────────────────

// Account-level Instagram totals include ads (Meta: "including in ads").
// These metrics take breakdown=media_product_type, whose "AD" share is the
// paid part — subtracted to leave the organic figure (verified live
// 2026-10-14). The others can't be split and include ads. Per-post figures
// (views, reach, likes, comments, shares, saves) are organic-only at source.
const IG_SPLIT_METRICS = ["reach", "views", "total_interactions", "likes", "comments", "shares", "saves"] as const;
const IG_PLAIN_METRICS = ["accounts_engaged", "profile_views", "profile_links_taps", "website_clicks"] as const;
const IG_TOTAL_METRICS = [...IG_SPLIT_METRICS, ...IG_PLAIN_METRICS] as const;
type IgMetric = (typeof IG_TOTAL_METRICS)[number];
type IgSplitMetric = (typeof IG_SPLIT_METRICS)[number];
/** What came from ads, per splittable metric; null = Meta didn't split. */
export type IgAdTotals = Record<IgSplitMetric, number | null>;
// Unique-person counts: a 90-day total can't be built by adding up three
// 30-day windows (anyone active in two windows would be counted twice), so
// those two go blank past 30 days rather than showing an inflated number.
const IG_UNIQUE = new Set<IgMetric>(["reach", "accounts_engaged"]);
type IgTotals = Record<IgMetric, number | null>;

export type InstagramInsights = {
  platform: "instagram";
  label: string;
  username: string | null;
  followers: number | null;
  /** Organic for the IG_SPLIT_METRICS when `ads` isn't null (reach then is
   *  "at least": anyone who saw both an ad and a post counts once). */
  current: IgTotals;
  previous: IgTotals;
  /** The paid part of the current period; null when Meta didn't split. */
  ads: IgAdTotals | null;
  series: { reach: TrendPoint[] };
  interactions: { label: string; value: number }[];
  profileActivity: { label: string; value: number }[];
  topPosts: PostRow[];
  postCount: number;
  postingTimes: PostingTimeAnalysis;
  /** Reels vs videos vs carousels vs images in the period, with average results. */
  formats: FormatSummary[];
  /** Set when Meta refused the account-level insights (usually a connection
   *  made before instagram_manage_insights was requested): the profile and the
   *  posts' own likes / comments still show, reach and views don't. */
  insightsError?: string;
  /** Where the followers are and who they are (needs instagram_manage_insights
   *  and 100+ followers); null when Meta doesn't return it. */
  audience: IgAudience | null;
};

export type IgAudience = {
  country: { label: string; value: number }[];
  city: { label: string; value: number }[];
  age: { label: string; value: number }[];
  gender: { label: string; value: number }[];
  total: number;
};

const regionName = (() => {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return (code: string) => names.of(code) ?? code;
  } catch {
    return (code: string) => code;
  }
})();

/** Followers by country, city, age and gender (lifetime snapshot). */
async function igAudience(igId: string, token: string, host: string): Promise<IgAudience> {
  type Breakdown = { data: { total_value?: { breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] } }[] };
  const get = (breakdown: string) =>
    graphGet<Breakdown>(
      `/${igId}/insights`,
      { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown, access_token: token },
      host
    ).then((r) => (r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []).map((x) => ({ key: x.dimension_values[0] ?? "", value: x.value })));
  const [country, city, age, gender] = await Promise.all([get("country"), get("city"), get("age"), get("gender")]);
  const top = (rows: { key: string; value: number }[], label: (k: string) => string, n: number) =>
    [...rows].sort((a, b) => b.value - a.value).slice(0, n).map((r) => ({ label: label(r.key), value: r.value }));
  const genderName: Record<string, string> = { F: "Women", M: "Men", U: "Unknown" };
  return {
    country: top(country, regionName, 10),
    city: top(city, (k) => k.split(",")[0], 10),
    age: [...age].sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ label: r.key, value: r.value })),
    gender: top(gender, (k) => genderName[k] ?? k, 3),
    total: country.reduce((s, r) => s + r.value, 0),
  };
}

const emptyIgTotals = () => Object.fromEntries(IG_TOTAL_METRICS.map((m) => [m, null])) as IgTotals;

type IgTotalRow = {
  name: string;
  total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] };
};

/** One window: every metric's total, plus the "AD" share of the splittable
 *  ones (null when Meta refused the breakdown — then totals include ads). */
async function igWindow(igId: string, token: string, w: Window, base: string): Promise<{ rows: IgTotalRow[]; split: boolean }> {
  const ask = (metrics: readonly string[], breakdown?: string) =>
    graphGet<{ data: IgTotalRow[] }>(
      `/${igId}/insights`,
      {
        metric: metrics.join(","),
        period: "day",
        metric_type: "total_value",
        ...(breakdown ? { breakdown } : {}),
        since: String(w.since),
        until: String(w.until),
        access_token: token,
      },
      base
    ).then((r) => r.data);
  const [plain, splitRows] = await Promise.all([
    ask(IG_PLAIN_METRICS),
    ask(IG_SPLIT_METRICS, "media_product_type").catch(() => null),
  ]);
  if (splitRows) return { rows: [...plain, ...splitRows], split: true };
  return { rows: [...plain, ...(await ask(IG_SPLIT_METRICS))], split: false };
}

async function igTotals(igId: string, token: string, windows: Window[], base: string): Promise<{ organic: IgTotals; ads: IgAdTotals | null }> {
  const results = await Promise.all(windows.map((w) => igWindow(igId, token, w, base)));
  const split = results.every((r) => r.split);
  const totalOf = (rows: IgTotalRow[], m: IgMetric) => rows.find((d) => d.name === m)?.total_value?.value ?? 0;
  // Meta leaves zero buckets out, so a missing "AD" row means no ad activity.
  // Saves / interactions are net of un-saves and un-likes, so a window's AD
  // share can come back negative — floor it at 0.
  const adOf = (rows: IgTotalRow[], m: IgMetric) =>
    Math.max(
      0,
      rows.find((d) => d.name === m)?.total_value?.breakdowns?.[0]?.results?.find((x) => x.dimension_values[0] === "AD")?.value ?? 0
    );
  const blank = (m: IgMetric) => windows.length > 1 && IG_UNIQUE.has(m);

  const organic = {} as IgTotals;
  for (const m of IG_TOTAL_METRICS) {
    organic[m] = blank(m)
      ? null
      : results.reduce(
          (sum, r) => sum + totalOf(r.rows, m) - (split && (IG_SPLIT_METRICS as readonly string[]).includes(m) ? adOf(r.rows, m) : 0),
          0
        );
  }
  let ads: IgAdTotals | null = null;
  if (split) {
    ads = {} as IgAdTotals;
    for (const m of IG_SPLIT_METRICS) ads[m] = blank(m) ? null : results.reduce((sum, r) => sum + adOf(r.rows, m), 0);
  }
  return { organic, ads };
}

/** Daily reach stitches cleanly across 30-day windows — each day's value
 *  stands on its own, unlike a range total. */
async function igReachSeries(igId: string, token: string, windows: Window[], base: string): Promise<TrendPoint[]> {
  const results = await Promise.all(
    windows.map((w) =>
      graphGet<{ data: InsightRow[] }>(`/${igId}/insights`, {
        metric: "reach",
        period: "day",
        since: String(w.since),
        until: String(w.until),
        access_token: token,
      }, base)
    )
  );
  return toSeries(results.flatMap((r) => r.data?.[0]?.values ?? []));
}

type IgMediaApi = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
};

async function igMedia(igId: string, token: string, since: number, host: string): Promise<PostRow[]> {
  const base = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  let data: IgMediaApi[];
  try {
    ({ data } = await graphGet<{ data: IgMediaApi[] }>(
      `/${igId}/media`,
      { fields: `${base},insights.metric(reach,views,shares,saved)`, limit: "100", access_token: token },
      host
    ));
  } catch {
    // One media type rejecting one metric fails the whole expanded request —
    // fall back to the counts every media object carries on its own.
    ({ data } = await graphGet<{ data: IgMediaApi[] }>(`/${igId}/media`, { fields: base, limit: "100", access_token: token }, host));
  }
  return data
    .filter((m) => new Date(m.timestamp).getTime() / 1000 >= since)
    .map((m) => {
      const metric = (name: string) => m.insights?.data?.find((d) => d.name === name)?.values?.[0]?.value ?? 0;
      return {
        id: m.id,
        date: m.timestamp,
        text: m.caption ?? "",
        image: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? null,
        url: m.permalink ?? null,
        views: metric("views"),
        reach: metric("reach"),
        reactions: m.like_count ?? 0,
        comments: m.comments_count ?? 0,
        shares: metric("shares"),
        extra: metric("saved"),
        format:
          m.media_product_type === "REELS"
            ? "reel"
            : m.media_type === "VIDEO"
              ? "video"
              : m.media_type === "CAROUSEL_ALBUM"
                ? "carousel"
                : "image",
      } satisfies PostRow;
    });
}

async function instagramInsights(account: ClientSocialAccount, rangeDays: InsightRange): Promise<InstagramInsights> {
  // Instagram-login accounts: own token, graph.instagram.com, same metrics.
  const viaLogin = isInstagramLoginAccount(account);
  const token = viaLogin ? await getFreshInstagramLoginToken(account) : decryptAccountToken(account);
  const host = viaLogin ? IG_LOGIN_GRAPH_BASE : GRAPH_BASE;
  const igId = account.external_id;
  const curWindows = windowsFor(rangeDays, 0, IG_MAX_WINDOW);
  const prevWindows = windowsFor(rangeDays, rangeDays, IG_MAX_WINDOW);

  // Account insights need instagram_manage_insights; if Meta refuses them, keep
  // the profile and the posts (their likes / comments come with the media itself).
  let insightsError: string | undefined;
  const orEmpty = <T,>(p: Promise<T>, empty: T) =>
    p.catch((e: unknown) => {
      insightsError ??= e instanceof Error ? e.message : String(e);
      return empty;
    });
  const noTotals = () => ({ organic: emptyIgTotals(), ads: null });
  const [profile, { organic: current, ads }, { organic: previous }, reach, media, audience] = await Promise.all([
    graphGet<{ username?: string; followers_count?: number }>(`/${igId}`, { fields: "username,followers_count", access_token: token }, host),
    orEmpty(igTotals(igId, token, curWindows, host), noTotals()),
    orEmpty(igTotals(igId, token, prevWindows, host), noTotals()),
    orEmpty(igReachSeries(igId, token, curWindows, host), [] as TrendPoint[]),
    igMedia(igId, token, curWindows[0].since, host),
    igAudience(igId, token, host).catch(() => null),
  ]);

  return {
    platform: "instagram",
    label: account.label,
    username: profile.username ?? null,
    followers: profile.followers_count ?? null,
    current,
    previous,
    ads,
    series: { reach },
    interactions: [
      { label: "Likes", value: current.likes ?? 0 },
      { label: "Comments", value: current.comments ?? 0 },
      { label: "Shares", value: current.shares ?? 0 },
      { label: "Saves", value: current.saves ?? 0 },
    ],
    profileActivity: [
      { label: "Profile views", value: current.profile_views ?? 0 },
      { label: "Link taps", value: current.profile_links_taps ?? 0 },
      { label: "Website clicks", value: current.website_clicks ?? 0 },
    ],
    // Without insights every post's views are 0, so rank by likes + comments instead.
    topPosts: [...media].sort((a, b) =>
      insightsError ? b.reactions + b.comments - (a.reactions + a.comments) : b.views - a.views
    ),
    postCount: media.length,
    postingTimes: analyzePostingTimes(media),
    formats: summarizeFormats(media),
    insightsError,
    audience,
  };
}

// ── LinkedIn Company Page ─────────────────────────────────────

export type LinkedInInsights = {
  platform: "linkedin";
  label: string;
  followers: number | null;
  current: LinkedInShareStats;
  previous: LinkedInShareStats;
  /** Page posts published in the period, by impressions. */
  topPosts: PostRow[];
  postCount: number;
};

/** Organic Page stats (LinkedIn's Community Management API): totals for
 *  this period and the one before, plus per-post figures. LinkedIn keeps
 *  about 12 months of share statistics. */
async function linkedinInsights(account: ClientSocialAccount, rangeDays: InsightRange): Promise<LinkedInInsights> {
  const token = decryptAccountToken(account);
  const org = account.external_id;
  const until = anchorNow() * 1000;
  const since = until - rangeDays * DAY * 1000;
  const before = since - rangeDays * DAY * 1000;

  const [followers, current, previous, posts] = await Promise.all([
    getOrganizationFollowers(org, token),
    getOrganizationShareTotals(org, token, since, until),
    getOrganizationShareTotals(org, token, before, since),
    listOrganizationPosts(org, token, 50),
  ]);
  const inRange = posts.filter((p) => p.publishedAt != null && p.publishedAt >= since);
  const [stats, images] = await Promise.all([
    getPostShareStats(org, token, inRange.map((p) => p.id)),
    getImageUrls(token, inRange.map((p) => p.imageUrn).filter((u): u is string => Boolean(u))),
  ]);
  const topPosts: PostRow[] = inRange
    .map((p) => {
      const s = stats[p.id];
      return {
        id: p.id,
        date: new Date(p.publishedAt!).toISOString(),
        // Commentary comes back in LinkedIn's "little" format: drop the escapes.
        text: p.text.replace(/\\(.)/g, "$1").replace(/\{hashtag\|\\?[#＃]\|([^}]*)\}/g, "#$1"),
        image: p.imageUrn ? images[p.imageUrn] ?? null : null,
        url: `https://www.linkedin.com/feed/update/${p.id}/`,
        views: s?.impressions ?? 0,
        reach: s?.uniqueImpressions ?? 0,
        reactions: s?.likes ?? 0,
        comments: s?.comments ?? 0,
        shares: s?.shares ?? 0,
        extra: s?.clicks ?? 0,
      };
    })
    .sort((a, b) => b.views - a.views);

  return { platform: "linkedin", label: account.label, followers, current, previous, topPosts, postCount: inRange.length };
}

// ── Entry point ───────────────────────────────────────────────

export type InsightsError = { platform: SocialPlatform; label: string; error: string };
export type InsightsSection = FacebookInsights | InstagramInsights | LinkedInInsights | InsightsError;

const PLATFORM_ORDER: Record<string, number> = { facebook: 0, instagram: 1, linkedin: 2 };

/** One section per connected Facebook Page / Instagram account / LinkedIn
 *  Company Page on the project (personal LinkedIn profiles have no Page
 *  stats). A failure in one (expired token, a metric Meta just retired)
 *  becomes that section's error card instead of breaking the whole page. */
export async function getProjectInsights(projectId: string, rangeDays: InsightRange): Promise<InsightsSection[]> {
  const accounts = (await listSocialAccountsForProject(projectId))
    .filter(
      (a) =>
        a.platform === "facebook" ||
        a.platform === "instagram" ||
        (a.platform === "linkedin" && a.external_id.startsWith("urn:li:organization:"))
    )
    .sort((a, b) => PLATFORM_ORDER[a.platform] - PLATFORM_ORDER[b.platform]);

  return Promise.all(
    accounts.map(async (a): Promise<InsightsSection> => {
      try {
        return a.platform === "facebook"
          ? await facebookInsights(a, rangeDays)
          : a.platform === "instagram"
            ? await instagramInsights(a, rangeDays)
            : await linkedinInsights(a, rangeDays);
      } catch (error) {
        return { platform: a.platform, label: a.label, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}
