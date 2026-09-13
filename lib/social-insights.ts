import "server-only";
import { GRAPH_BASE } from "./social-fb";
import { listSocialAccountsForProject, decryptAccountToken } from "./social-accounts";
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

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
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
};

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

type FbTotals = {
  views: number;
  engagements: number;
  pageVisits: number;
  videoViews: number;
  /** De-duplicated viewers across the whole range — 7/28-day ranges only. */
  viewers: number | null;
  avgDailyViewers: number;
  netFollows: number;
};

export type FacebookInsights = {
  platform: "facebook";
  label: string;
  followers: number | null;
  current: FbTotals;
  previous: FbTotals;
  series: { views: TrendPoint[]; engagements: TrendPoint[]; followers: TrendPoint[] };
  reactions: { label: string; value: number }[];
  topPosts: PostRow[];
  postCount: number;
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

function fbTotals(daily: Map<string, DailyValue[]>, viewers: number | null): FbTotals {
  const s = (name: string) => toSeries(daily.get(name));
  const dailyViewers = s("page_total_media_view_unique");
  return {
    views: sumOf(s("page_media_view")),
    engagements: sumOf(s("page_post_engagements")),
    pageVisits: sumOf(s("page_views_total")),
    videoViews: sumOf(s("page_video_views")),
    viewers,
    avgDailyViewers: dailyViewers.length ? sumOf(dailyViewers) / dailyViewers.length : 0,
    netFollows: sumOf(s("page_daily_follows_unique")) - sumOf(s("page_daily_unfollows_unique")),
  };
}

async function facebookInsights(account: ClientSocialAccount, rangeDays: InsightRange): Promise<FacebookInsights> {
  const token = decryptAccountToken(account);
  const pageId = account.external_id;
  const [cur] = windowsFor(rangeDays, 0);
  const [prev] = windowsFor(rangeDays, rangeDays);

  const [curDaily, prevDaily, curViewers, prevViewers, posts] = await Promise.all([
    fbDaily(pageId, token, cur),
    fbDaily(pageId, token, prev),
    fbUniqueViewers(pageId, token, rangeDays, cur.until),
    fbUniqueViewers(pageId, token, rangeDays, prev.until),
    fbPosts(pageId, token, cur),
  ]);

  const reactionTotals = new Map<string, number>();
  for (const v of curDaily.get("page_actions_post_reactions_total") ?? []) {
    if (typeof v.value !== "object" || v.value === null) continue;
    for (const [type, n] of Object.entries(v.value)) reactionTotals.set(type, (reactionTotals.get(type) ?? 0) + n);
  }
  const followers = toSeries(curDaily.get("page_follows"));

  return {
    platform: "facebook",
    label: account.label,
    followers: followers.at(-1)?.value ?? null,
    current: fbTotals(curDaily, curViewers),
    previous: fbTotals(prevDaily, prevViewers),
    series: {
      views: toSeries(curDaily.get("page_media_view")),
      engagements: toSeries(curDaily.get("page_post_engagements")),
      followers,
    },
    reactions: [...reactionTotals]
      .map(([type, value]) => ({ label: REACTION_LABELS[type] ?? type, value }))
      .sort((a, b) => b.value - a.value),
    topPosts: [...posts].sort((a, b) => b.views - a.views).slice(0, 10),
    postCount: posts.length,
  };
}

// ── Instagram ─────────────────────────────────────────────────

const IG_TOTAL_METRICS = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "profile_views",
  "profile_links_taps",
  "website_clicks",
] as const;
type IgMetric = (typeof IG_TOTAL_METRICS)[number];
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
  current: IgTotals;
  previous: IgTotals;
  series: { reach: TrendPoint[] };
  interactions: { label: string; value: number }[];
  profileActivity: { label: string; value: number }[];
  topPosts: PostRow[];
  postCount: number;
};

async function igTotals(igId: string, token: string, windows: Window[]): Promise<IgTotals> {
  const results = await Promise.all(
    windows.map((w) =>
      graphGet<{ data: { name: string; total_value?: { value?: number } }[] }>(`/${igId}/insights`, {
        metric: IG_TOTAL_METRICS.join(","),
        period: "day",
        metric_type: "total_value",
        since: String(w.since),
        until: String(w.until),
        access_token: token,
      })
    )
  );
  const out = {} as IgTotals;
  for (const m of IG_TOTAL_METRICS) {
    out[m] =
      windows.length > 1 && IG_UNIQUE.has(m)
        ? null
        : results.reduce((sum, r) => sum + (r.data.find((d) => d.name === m)?.total_value?.value ?? 0), 0);
  }
  return out;
}

/** Daily reach stitches cleanly across 30-day windows — each day's value
 *  stands on its own, unlike a range total. */
async function igReachSeries(igId: string, token: string, windows: Window[]): Promise<TrendPoint[]> {
  const results = await Promise.all(
    windows.map((w) =>
      graphGet<{ data: InsightRow[] }>(`/${igId}/insights`, {
        metric: "reach",
        period: "day",
        since: String(w.since),
        until: String(w.until),
        access_token: token,
      })
    )
  );
  return toSeries(results.flatMap((r) => r.data?.[0]?.values ?? []));
}

type IgMediaApi = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
};

async function igMedia(igId: string, token: string, since: number): Promise<PostRow[]> {
  const base = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  let data: IgMediaApi[];
  try {
    ({ data } = await graphGet<{ data: IgMediaApi[] }>(`/${igId}/media`, {
      fields: `${base},insights.metric(reach,views,shares,saved)`,
      limit: "100",
      access_token: token,
    }));
  } catch {
    // One media type rejecting one metric fails the whole expanded request —
    // fall back to the counts every media object carries on its own.
    ({ data } = await graphGet<{ data: IgMediaApi[] }>(`/${igId}/media`, { fields: base, limit: "100", access_token: token }));
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
      };
    });
}

async function instagramInsights(account: ClientSocialAccount, rangeDays: InsightRange): Promise<InstagramInsights> {
  const token = decryptAccountToken(account);
  const igId = account.external_id;
  const curWindows = windowsFor(rangeDays, 0, IG_MAX_WINDOW);
  const prevWindows = windowsFor(rangeDays, rangeDays, IG_MAX_WINDOW);

  const [profile, current, previous, reach, media] = await Promise.all([
    graphGet<{ username?: string; followers_count?: number }>(`/${igId}`, {
      fields: "username,followers_count",
      access_token: token,
    }),
    igTotals(igId, token, curWindows),
    igTotals(igId, token, prevWindows),
    igReachSeries(igId, token, curWindows),
    igMedia(igId, token, curWindows[0].since),
  ]);

  return {
    platform: "instagram",
    label: account.label,
    username: profile.username ?? null,
    followers: profile.followers_count ?? null,
    current,
    previous,
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
    topPosts: [...media].sort((a, b) => b.views - a.views).slice(0, 10),
    postCount: media.length,
  };
}

// ── Entry point ───────────────────────────────────────────────

export type InsightsError = { platform: SocialPlatform; label: string; error: string };
export type InsightsSection = FacebookInsights | InstagramInsights | InsightsError;

/** One section per connected Facebook Page / Instagram account on the
 *  project. A failure in one (expired token, a metric Meta just retired)
 *  becomes that section's error card instead of breaking the whole page. */
export async function getProjectInsights(projectId: string, rangeDays: InsightRange): Promise<InsightsSection[]> {
  const accounts = (await listSocialAccountsForProject(projectId))
    .filter((a) => a.platform === "facebook" || a.platform === "instagram")
    .sort((a, b) => (a.platform === b.platform ? 0 : a.platform === "facebook" ? -1 : 1));

  return Promise.all(
    accounts.map(async (a): Promise<InsightsSection> => {
      try {
        return a.platform === "facebook" ? await facebookInsights(a, rangeDays) : await instagramInsights(a, rangeDays);
      } catch (error) {
        return { platform: a.platform, label: a.label, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
}
