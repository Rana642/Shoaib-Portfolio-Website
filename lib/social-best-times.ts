import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { GRAPH_BASE } from "./social-fb";
import { listSocialAccountsForProject, decryptAccountToken } from "./social-accounts";
import { IG_LOGIN_GRAPH_BASE, getFreshInstagramLoginToken, isInstagramLoginAccount } from "./social-instagram-login";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * Best posting times per project, for scheduling planner posts at each
 * brand's own time (Shoaib, 2026-10-09). Two signals, both read-only:
 *  1. Instagram `online_followers` — the hours the account's followers are
 *     online (the closest thing Meta still serves; Facebook's page_fans_online
 *     is retired). Meta keys its hours in Pacific time; converted to PKT here.
 *  2. Reach of the account's own posts in the last N days, by PKT hour and
 *     weekday (median, so one viral post doesn't decide). Biased toward the
 *     hours we already post at — read it with the post counts.
 * Runs on the server (needs the page tokens), exposed as a remote MCP tool.
 */

const PKT_OFFSET_H = 5;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PAGES = 5;

type Post = { date: string; reach: number };
type Bucket = { key: string; median: number; count: number };
export type AccountTimes = {
  platform: string;
  label: string;
  posts: number;
  byHour: Bucket[];
  byDay: Bucket[];
  /** Average followers online per PKT hour (0–23), Instagram only. */
  onlineByPktHour: number[] | null;
  note?: string;
};

async function graphJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message || `Graph API error (HTTP ${res.status})`);
  return body;
}

async function pagedPosts<T>(firstUrl: string, map: (row: T) => Post | null, stopBefore: number): Promise<Post[]> {
  const out: Post[] = [];
  let next: string | null = firstUrl;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const body: { data?: T[]; paging?: { next?: string } } = await graphJson(next);
    const rows = (body.data ?? []).map(map).filter((p): p is Post => p !== null);
    out.push(...rows.filter((p) => new Date(p.date).getTime() >= stopBefore));
    if (rows.some((p) => new Date(p.date).getTime() < stopBefore)) break;
    next = body.paging?.next ?? null;
  }
  return out;
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function buckets(posts: Post[], keyOf: (d: Date) => string): Bucket[] {
  const groups = new Map<string, number[]>();
  for (const p of posts) {
    const k = keyOf(new Date(new Date(p.date).getTime() + PKT_OFFSET_H * 3600_000));
    groups.set(k, [...(groups.get(k) ?? []), p.reach]);
  }
  return [...groups].map(([key, v]) => ({ key, median: Math.round(median(v)), count: v.length })).sort((a, b) => b.median - a.median);
}

/** Hours to add to a wall-clock hour in `tz` to get PKT, for today's date (handles DST). */
function hoursToPkt(tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const wallAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  const tzOffsetH = Math.round((wallAsUtc - Date.now()) / 3600_000);
  return PKT_OFFSET_H - tzOffsetH;
}

async function accountTimes(account: ClientSocialAccount, days: number): Promise<AccountTimes> {
  const since = Date.now() - days * 86400_000;
  const base: AccountTimes = { platform: account.platform, label: account.label, posts: 0, byHour: [], byDay: [], onlineByPktHour: null };
  try {
    let posts: Post[] = [];
    if (account.platform === "facebook") {
      const token = decryptAccountToken(account);
      const url = `${GRAPH_BASE}/${account.external_id}/published_posts?${new URLSearchParams({
        fields: "created_time,insights.metric(post_total_media_view_unique)",
        since: String(Math.floor(since / 1000)),
        limit: "100",
        access_token: token,
      })}`;
      type Row = { created_time: string; insights?: { data?: { values?: { value?: unknown }[] }[] } };
      posts = await pagedPosts<Row>(url, (r) => {
        const v = r.insights?.data?.[0]?.values?.[0]?.value;
        return { date: r.created_time, reach: typeof v === "number" ? v : 0 };
      }, since);
    } else {
      const viaLogin = isInstagramLoginAccount(account);
      const token = viaLogin ? await getFreshInstagramLoginToken(account) : decryptAccountToken(account);
      const host = viaLogin ? IG_LOGIN_GRAPH_BASE : GRAPH_BASE;
      type Row = { timestamp: string; insights?: { data?: { values?: { value?: number }[] }[] } };
      const media = (fields: string) => `${host}/${account.external_id}/media?${new URLSearchParams({ fields, limit: "100", access_token: token })}`;
      const toPost = (r: Row) => ({ date: r.timestamp, reach: r.insights?.data?.[0]?.values?.[0]?.value ?? 0 });
      try {
        posts = await pagedPosts<Row>(media("timestamp,insights.metric(reach)"), toPost, since);
      } catch {
        posts = await pagedPosts<Row>(media("timestamp"), toPost, since); // one media type rejecting reach fails the whole call
        base.note = "Reach not available for some media — counts only.";
      }
      try {
        const o = await graphJson<{ data?: { values?: { value?: Record<string, number> }[] }[] }>(
          `${host}/${account.external_id}/insights?${new URLSearchParams({ metric: "online_followers", period: "lifetime", access_token: token })}`
        );
        const values = o.data?.[0]?.values ?? [];
        if (values.length) {
          const shift = hoursToPkt("America/Los_Angeles");
          const sum = new Array(24).fill(0), n = new Array(24).fill(0);
          for (const day of values) for (const [h, c] of Object.entries(day.value ?? {})) {
            const pkt = (((+h + shift) % 24) + 24) % 24;
            sum[pkt] += c; n[pkt] += 1;
          }
          base.onlineByPktHour = sum.map((s, i) => (n[i] ? Math.round(s / n[i]) : 0));
        }
      } catch (e) {
        base.note = [base.note, `Followers-online data unavailable: ${e instanceof Error ? e.message : String(e)}`].filter(Boolean).join(" ");
      }
    }
    return {
      ...base,
      posts: posts.length,
      byHour: buckets(posts, (d) => String(d.getUTCHours()).padStart(2, "0") + ":00"),
      byDay: buckets(posts, (d) => DAYS[d.getUTCDay()]),
    };
  } catch (e) {
    return { ...base, note: e instanceof Error ? e.message : String(e) };
  }
}

type ProjectRow = { id: string; name: string; clients: { name: string } | { name: string }[] | null };
const labelOf = (p: ProjectRow) => `${(Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "Unknown"} — ${p.name}`;

export async function bestPostingTimes(query: string, days: number) {
  const { data } = await db.from("client_projects").select("id, name, clients(name)");
  const needle = query.toLowerCase();
  const projects = ((data ?? []) as ProjectRow[]).filter((p) => labelOf(p).toLowerCase().includes(needle)).slice(0, 12);
  return Promise.all(
    projects.map(async (p) => {
      const accounts = (await listSocialAccountsForProject(p.id)).filter((a) => a.platform === "facebook" || a.platform === "instagram");
      return { project: labelOf(p), projectId: p.id, accounts: await Promise.all(accounts.map((a) => accountTimes(a, days))) };
    })
  );
}

function render(results: Awaited<ReturnType<typeof bestPostingTimes>>, days: number): string {
  const lines = [`# Best posting times (last ${days} days, PKT)`, ""];
  for (const r of results) {
    lines.push(`## ${r.project}`);
    for (const a of r.accounts) {
      lines.push(`- **${a.platform}** ${a.label}: ${a.posts} posts`);
      if (a.byHour.length) lines.push(`  - by hour (median reach, posts): ${a.byHour.slice(0, 8).map((b) => `${b.key} ${b.median} (${b.count})`).join(" · ")}`);
      if (a.byDay.length) lines.push(`  - by day: ${a.byDay.map((b) => `${b.key} ${b.median} (${b.count})`).join(" · ")}`);
      if (a.onlineByPktHour) {
        const top = a.onlineByPktHour.map((v, h) => ({ h, v })).sort((x, y) => y.v - x.v).slice(0, 6);
        lines.push(`  - followers online, peak PKT hours: ${top.map((t) => `${String(t.h).padStart(2, "0")}:00 (${t.v})`).join(" · ")}`);
      }
      if (a.note) lines.push(`  - note: ${a.note}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function registerBestTimeTool(server: McpServer): void {
  server.registerTool(
    "social_best_posting_times",
    {
      title: "Best Posting Times",
      description: `When to post for each brand: Instagram followers-online hours (converted to PKT) and the reach of the brand's own Facebook/Instagram posts by PKT hour and weekday (median). Read-only.

Use it to pick each project's daily posting time before social_set_caption_and_schedule. The post-reach split is biased toward hours already used — weigh it by its post counts; the followers-online hours are the cleaner signal.

Args:
  - query (string): part of a client or project name, e.g. "Aijaz" (all of that client's brands) or "Avalon".
  - days (number, optional, 7–90, default 90).

Returns: Markdown per project, plus structured JSON { results: [{ project, projectId, accounts: [{ platform, label, posts, byHour, byDay, onlineByPktHour, note }] }] }.`,
      inputSchema: { query: z.string().min(2), days: z.number().int().min(7).max(90).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, days }: { query: string; days?: number }) => {
      try {
        const d = days ?? 90;
        const results = await bestPostingTimes(query, d);
        if (!results.length) return { content: [{ type: "text", text: `No project matched "${query}".` }], isError: true };
        return { content: [{ type: "text", text: render(results, d) }], structuredContent: { results } };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
