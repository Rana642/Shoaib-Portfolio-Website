import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { getProjectInsights, type InsightsSection, type PostRow, type PostingTimeAnalysis } from "./social-insights";
import { INSIGHT_RANGES, type InsightRange, type TrendPoint } from "./social-insights-shared";

/**
 * Read-only Facebook / Instagram (and LinkedIn Company Page) insights tool
 * shared by the local (mcp/tools/social.ts) and remote (lib/mcp-remote-tools.ts)
 * MCP servers — the same data as the dashboard's /dashboard/social/insights
 * page, for audits. Page tokens are decrypted server-side only. Daily series
 * are summarised and captions shortened so a report stays readable.
 */

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const fail = (text: string) => ({ content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true as const });

const shortPost = (p: PostRow) => {
  const { image: _image, ...rest } = p;
  return { ...rest, text: p.text.length > 160 ? `${p.text.slice(0, 157)}…` : p.text };
};

const timesSummary = (t: PostingTimeAnalysis) => ({
  reliable: t.reliable,
  sampleSize: t.sampleSize,
  bestDays: t.byDayOfWeek.slice(0, 3),
  bestHours: t.byHour.slice(0, 3),
});

const seriesSummary = (series: Record<string, TrendPoint[]>) =>
  Object.fromEntries(
    Object.entries(series).map(([key, points]) => [
      key,
      { days: points.length, total: points.reduce((s, p) => s + p.value, 0), first: points[0]?.value ?? null, last: points.at(-1)?.value ?? null },
    ])
  );

function compact(section: InsightsSection, postLimit: number) {
  if ("error" in section) return section;
  const { series, topPosts, postingTimes, ...rest } = section as InsightsSection & {
    series?: Record<string, TrendPoint[]>;
    topPosts?: PostRow[];
    postingTimes?: PostingTimeAnalysis;
  };
  return {
    ...rest,
    ...(series ? { trend: seriesSummary(series) } : {}),
    ...(postingTimes ? { postingTimes: timesSummary(postingTimes) } : {}),
    ...(topPosts ? { topPosts: topPosts.slice(0, postLimit).map(shortPost) } : {}),
  };
}

export function registerSocialInsightsTools(server: McpServer) {
  server.registerTool(
    "social_get_insights",
    {
      title: "Social Insights Report",
      description: `Reads a project's Facebook Page and Instagram account insights (plus its LinkedIn Company Page, if any) — the same numbers as the dashboard's Insights page. For audits and "how is the page doing" questions. Read-only.

Args:
  - project (string): project name or part of it, e.g. "Choppers Salon", "Avalon". Must match one project (an exact name wins).
  - days (7 | 28 | 90, optional, default 28): the period; "previous" is the period before it.
  - postLimit (number, optional, default 10, max 25): top posts per account.

Returns (JSON) one section per account:
  - facebook: followers, current/previous { views (organic when adViews is set), adViews, engagements, pageVisits, videoViews, viewers, avgDailyViewers, netFollows }, reactions, postCount, trend (series totals), postingTimes (best days/hours by median reach, PKT), topPosts [{ date, text, url, views, reach, reactions, comments, shares, extra = link clicks, adViews }].
  - instagram: username, followers, current/previous (reach, views, interactions, profile visits… organic where Meta splits), ads (paid part), interactions, profileActivity, formats (reels/images/carousels with averages), audience (country/city/age/gender), postCount, postingTimes, topPosts (extra = saves), insightsError when Meta refused account-level insights.
  - A failing account comes back as { platform, label, error } instead of failing the whole call.`,
      inputSchema: {
        project: z.string().min(1).max(120),
        days: z.union([z.literal(7), z.literal(28), z.literal(90), z.enum(["7", "28", "90"])]).optional(),
        postLimit: z.union([z.number().int().min(1).max(25), z.string().regex(/^\d+$/)]).optional(),
      },
      annotations: READ,
    },
    async ({ project, days, postLimit }: { project: string; days?: number | string; postLimit?: number | string }) => {
      try {
        const range = Number(days ?? 28) as InsightRange;
        if (!INSIGHT_RANGES.includes(range)) return fail("days must be 7, 28 or 90.");
        const limit = Math.min(25, Math.max(1, Number(postLimit ?? 10)));

        const wanted = project.trim();
        const { data: matches } = await db.from("client_projects").select("id, name").ilike("name", `%${wanted}%`);
        const exact = (matches ?? []).filter((p) => p.name.toLowerCase() === wanted.toLowerCase());
        const chosen = exact.length === 1 ? exact : matches ?? [];
        if (!chosen.length) return fail(`No project matches '${project}'.`);
        if (chosen.length > 1) return fail(`'${project}' matches ${chosen.length} projects (${chosen.map((p) => p.name).join(", ")}). Use a more specific name.`);

        const sections = await getProjectInsights(chosen[0].id, range);
        if (!sections.length) return fail(`${chosen[0].name} has no Facebook Page, Instagram account or LinkedIn Company Page connected.`);
        const report = { project: chosen[0].name, days: range, accounts: sections.map((s) => compact(s, limit)) };
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
