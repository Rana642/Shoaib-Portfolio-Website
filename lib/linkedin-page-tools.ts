import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { decryptAccountToken } from "./social-accounts";
import {
  getFollowerBreakdown,
  getImageUrls,
  getOrganizationFollowers,
  getOrganizationLifetimeStats,
  getOrganizationProfile,
  getOrganizationShareTotals,
  getPostShareStats,
  listOrganizationPosts,
} from "./social-linkedin";
import type { ClientSocialAccount } from "./dashboard/types";

/**
 * Read-only LinkedIn Company Page tool shared by the local (mcp/tools/social.ts)
 * and remote (lib/mcp-remote-tools.ts) MCP servers — for auditing a client's
 * Page through the Community Management API with the stored token (which only
 * the server can decrypt). Nothing on LinkedIn is changed.
 */

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const fail = (text: string) => ({ content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true as const });
const DAY = 86_400_000;

/** Runs one part of the report; a failure becomes that part's error text. */
async function part<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function registerLinkedInPageTools(server: McpServer) {
  server.registerTool(
    "linkedin_get_page",
    {
      title: "LinkedIn Company Page Report",
      description: `Reads a client's LinkedIn Company Page through the Community Management API — for audits and status questions. Read-only.

Args:
  - project (string): project name or part of it, e.g. "Ads by Shoaib", "Tad". The project must have a LinkedIn Company Page imported on the Connections page.
  - postLimit (number, optional, default 20, max 50): how many recent posts to include with their stats.

Returns (JSON): page { urn, label on the dashboard, token_expires_at }, profile (LinkedIn's organization record: localizedName, vanityName, localizedDescription, localizedWebsite, tagline/localizedSpecialties, industries, staffCountRange, locations, logo/cover assets…), followers (total), followerBreakdown (top countries / industries / seniorities / functions / company sizes, as LinkedIn URNs), stats { lifetime, last30Days, previous30Days } (organic impressions, unique impressions, clicks, likes, comments, reposts, engagement), recentPosts [{ id, url, publishedAt, text, imageUrl, stats }]. Each part that LinkedIn refuses comes back as { error } instead of failing the whole call.`,
      inputSchema: {
        project: z.string().min(1).max(120),
        postLimit: z.union([z.number().int().min(1).max(50), z.string().regex(/^\d+$/)]).optional(),
      },
      annotations: READ,
    },
    async ({ project, postLimit }: { project: string; postLimit?: number | string }) => {
      try {
        const limit = Math.min(50, Math.max(1, Number(postLimit ?? 20)));
        const { data: projects } = await db.from("client_projects").select("id, name").ilike("name", `%${project.trim()}%`);
        if (!projects?.length) return fail(`No project matches '${project}'.`);
        const { data: accounts } = await db
          .from("client_social_accounts")
          .select("*")
          .eq("platform", "linkedin")
          .like("external_id", "urn:li:organization:%")
          .in("project_id", projects.map((p) => p.id));
        const account = (accounts ?? [])[0] as ClientSocialAccount | undefined;
        if (!account) return fail(`No LinkedIn Company Page is connected to ${projects.map((p) => p.name).join(", ")}.`);

        const token = decryptAccountToken(account);
        const org = account.external_id;
        const now = Date.now();
        const [profile, followers, followerBreakdown, lifetime, last30Days, previous30Days, posts] = await Promise.all([
          part(() => getOrganizationProfile(org, token)),
          part(() => getOrganizationFollowers(org, token)),
          part(() => getFollowerBreakdown(org, token)),
          part(() => getOrganizationLifetimeStats(org, token)),
          part(() => getOrganizationShareTotals(org, token, now - 30 * DAY, now)),
          part(() => getOrganizationShareTotals(org, token, now - 60 * DAY, now - 30 * DAY)),
          part(() => listOrganizationPosts(org, token, limit)),
        ]);

        let recentPosts: unknown = posts;
        if (Array.isArray(posts)) {
          const [stats, images] = await Promise.all([
            part(() => getPostShareStats(org, token, posts.map((p) => p.id))),
            getImageUrls(token, posts.map((p) => p.imageUrn).filter((u): u is string => Boolean(u))),
          ]);
          recentPosts = posts.map((p) => ({
            id: p.id,
            url: `https://www.linkedin.com/feed/update/${p.id}/`,
            publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
            text: p.text,
            imageUrl: p.imageUrn ? images[p.imageUrn] ?? null : null,
            stats: "error" in stats ? stats : stats[p.id] ?? null,
          }));
        }

        const report = {
          page: { urn: org, label: account.label, token_expires_at: account.token_expires_at },
          profile,
          followers,
          followerBreakdown,
          stats: { lifetime, last30Days, previous30Days },
          recentPosts,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
    }
  );
}
