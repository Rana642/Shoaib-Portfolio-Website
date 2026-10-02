import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { listProjectOptions } from "./dashboard/projects";
import { GBP_DAILY_CAP_PER_LOCATION, GBP_MIN_GAP_SECONDS, STARS, findLocation, gbpAccessToken, getGbpConnection, listReviews, paceGbpWrite, replyToReview, type GbpConnection } from "./gbp";
import { listQueuedReplies, queueReplies, queuedStatuses, replyQueueStats, type QueueInput, type QueueStatus } from "./gbp-replies";

/**
 * Google Business Profile tools, per client project — the same grants the
 * dashboard's /dashboard/gbp page uses (Socially Snap OAuth client, token
 * per project in gbp_connections). Reads run directly; every write needs
 * confirm=true or it only returns a preview, like the other marketing tools.
 *
 * Google-friendly pace (standing rule): writes are NEVER done in bulk. Every
 * write goes through paceGbpWrite() — one at a time, a minimum gap apart,
 * and a daily cap per location. A caller asked to "reply to all" must do
 * one, then come back later for the next, not loop.
 */
/** Some MCP clients send numbers as strings ("5"); accept both. */
const intArg = (min: number, max: number) =>
  z.union([z.number().int().min(min).max(max), z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max))]);

const PACE_NOTE = `GOOGLE-FRIENDLY PACE (standing rule): never reply or post in bulk. One write at a time, at least ${GBP_MIN_GAP_SECONDS / 60} minutes apart across all projects, max ${GBP_DAILY_CAP_PER_LOCATION} per location per 24 h — the server refuses anything faster. To answer many reviews, write every reply and put them in the queue with gbp_queue_replies: the server sends them one by one at a human pace.`;

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: { data } });
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: formatError(error) }], isError: true });

/** A connected project by id or a fuzzy "client / project" name. */
async function resolveConnected(project: string): Promise<{ id: string; label: string; conn: GbpConnection }> {
  const { data } = await db.from("gbp_connections").select("project_id");
  const connectedIds = new Set(((data ?? []) as { project_id: string }[]).map((r) => r.project_id));
  const options = (await listProjectOptions()).filter((p) => connectedIds.has(p.id));
  const q = project.trim().toLowerCase();
  const full = (p: (typeof options)[number]) => `${p.client} — ${p.name}`.toLowerCase();
  const hit =
    options.find((p) => p.id === project) ??
    options.find((p) => p.name.toLowerCase() === q || full(p) === q) ??
    options.filter((p) => full(p).includes(q))[0];
  if (!hit) {
    throw new Error(
      `No Google Business connection matches "${project}". Connected: ${options.map((p) => p.label).join("; ") || "none yet — connect one at /dashboard/gbp"}.`
    );
  }
  const conn = await getGbpConnection(hit.id);
  if (!conn) throw new Error("That project's Google Business connection disappeared — reconnect it at /dashboard/gbp.");
  return { id: hit.id, label: hit.label, conn };
}

function pickLocation(conn: GbpConnection, location?: string) {
  if (!location) {
    const loc = findLocation(conn) ?? (conn.locations.length === 1 ? conn.locations[0] : null);
    if (!loc) throw new Error(`Pick a location: ${conn.locations.map((l) => `${l.title} (${l.name})`).join("; ")}`);
    return loc;
  }
  const q = location.toLowerCase();
  const loc = conn.locations.find((l) => l.name === location) ?? conn.locations.find((l) => l.title.toLowerCase().includes(q));
  if (!loc) throw new Error(`No location "${location}". Available: ${conn.locations.map((l) => `${l.title} (${l.name})`).join("; ")}`);
  return loc;
}

const ALLOWED_HOSTS = [
  "mybusinessaccountmanagement.googleapis.com",
  "mybusinessbusinessinformation.googleapis.com",
  "mybusinessverifications.googleapis.com",
  "mybusinessnotifications.googleapis.com",
  "mybusinessplaceactions.googleapis.com",
  "mybusinesslodging.googleapis.com",
  "businessprofileperformance.googleapis.com",
  "mybusiness.googleapis.com",
];

export function registerGbpTools(server: McpServer): void {
  server.registerTool(
    "gbp_list_connections",
    {
      title: "Google Business — Connected Projects",
      description: "Lists the client projects whose Google Business Profile is connected (at /dashboard/gbp), with the Google account used and every location it manages. Use a project label and a location title/name with the other gbp_* tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const { data } = await db.from("gbp_connections").select("project_id, connected_email, locations, selected_location, connected_at");
        const labels = new Map((await listProjectOptions()).map((p) => [p.id, p.label]));
        return json(
          ((data ?? []) as (GbpConnection & { project_id: string })[]).map((c) => ({
            project: labels.get(c.project_id) ?? c.project_id,
            project_id: c.project_id,
            connected_email: c.connected_email,
            default_location: c.selected_location,
            locations: c.locations,
          }))
        );
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "gbp_list_reviews",
    {
      title: "Google Business — Reviews",
      description: `Reads the latest reviews of a connected client's Business Profile location (newest first, up to 50 per page), with the average rating, total count, any owner reply, and "queued" — the review's state in the reply queue (approved = waiting to be sent, draft, sent, skipped, failed) or null when no reply has been queued for it.

Args:
  - project (string): project id, its name, or part of "Client — Project".
  - location (string, optional): location title or "locations/..." name; defaults to the project's chosen location.
  - onlyUnreplied (boolean, optional): only reviews without an owner reply.
  - pageToken (string, optional): from a previous call's nextPageToken.`,
      inputSchema: { project: z.string().min(1), location: z.string().optional(), onlyUnreplied: z.boolean().optional(), pageToken: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, location, onlyUnreplied, pageToken }: { project: string; location?: string; onlyUnreplied?: boolean; pageToken?: string }) => {
      try {
        const p = await resolveConnected(project);
        const loc = pickLocation(p.conn, location);
        const res = await listReviews(await gbpAccessToken(p.id), loc, pageToken);
        const picked = onlyUnreplied ? res.reviews.filter((r) => !r.reviewReply) : res.reviews;
        const queued = await queuedStatuses(loc.name, picked.map((r) => r.reviewId));
        const reviews = picked.map((r) => ({
          reviewId: r.reviewId,
          reviewer: r.reviewer.isAnonymous ? "Anonymous" : r.reviewer.displayName ?? "Google user",
          stars: STARS[r.starRating] ?? 0,
          comment: r.comment ?? null,
          created: r.createTime,
          reply: r.reviewReply?.comment ?? null,
          queued: queued.get(r.reviewId) ?? null,
        }));
        return json({ project: p.label, location: loc.title, averageRating: res.averageRating, totalReviews: res.total, nextPageToken: res.nextPageToken, reviews });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "gbp_reply_review",
    {
      title: "Google Business — Reply to a Review",
      description: `Posts (or replaces) the owner's public reply to one review. The reply is public on Google immediately.

Args:
  - project, location: as in gbp_list_reviews.
  - reviewId (string): from gbp_list_reviews.
  - comment (string): the reply text (1–4096 characters).
  - confirm (boolean): when false/omitted nothing is sent — a preview is returned. Set true to publish.

${PACE_NOTE}`,
      inputSchema: { project: z.string().min(1), location: z.string().optional(), reviewId: z.string().min(1), comment: z.string().min(1).max(4096), confirm: z.boolean().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ project, location, reviewId, comment, confirm }: { project: string; location?: string; reviewId: string; comment: string; confirm?: boolean }) => {
      try {
        const p = await resolveConnected(project);
        const loc = pickLocation(p.conn, location);
        if (!confirm) return text(`PREVIEW ONLY — nothing was sent. Re-run with confirm=true to publish this reply.\n\nProject: ${p.label}\nLocation: ${loc.title}\nReview: ${reviewId}\nReply:\n${comment}`);
        return json(await replyToReview(await gbpAccessToken(p.id), loc, reviewId, comment));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "gbp_queue_replies",
    {
      title: "Google Business — Queue Review Replies",
      description: `Puts written replies in the reply queue; the server posts them one at a time at a human pace (daytime in Pakistan, 12+ minutes apart, complaints first, then newest first) and skips any review that got a reply in the meantime. Use this to answer many reviews — write each reply for its review (varied, specific, in the business's voice), never one template for all.

Args:
  - project, location: as in gbp_list_reviews.
  - replies (array): [{ reviewId, reply, reviewer?, stars?, comment?, created? }] — copy reviewer/stars/comment/created from gbp_list_reviews so the queue shows what each reply answers.
  - status ("approved" | "draft" | "skipped", default "approved"): approved = send when its turn comes; draft = hold for Shoaib; skipped = don't send. Queueing a review again replaces its waiting reply.
  - onlyNew (boolean, optional): leave every review that is already in the queue (waiting, sent, skipped…) untouched and add only the rest — use this for routine "reply to new reviews" runs.
  - confirm (boolean): when false/omitted nothing is saved — a preview is returned.`,
      inputSchema: {
        project: z.string().min(1),
        location: z.string().optional(),
        replies: z
          .array(
            z.object({
              reviewId: z.string().min(1),
              reply: z.string().min(1).max(4096),
              reviewer: z.string().optional(),
              stars: intArg(0, 5).optional(),
              comment: z.string().optional(),
              created: z.string().optional(),
            })
          )
          .min(1)
          .max(200),
        status: z.enum(["approved", "draft", "skipped"]).optional(),
        onlyNew: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({
      project,
      location,
      replies,
      status = "approved",
      onlyNew,
      confirm,
    }: {
      project: string;
      location?: string;
      replies: QueueInput[];
      status?: "approved" | "draft" | "skipped";
      onlyNew?: boolean;
      confirm?: boolean;
    }) => {
      try {
        const p = await resolveConnected(project);
        const loc = pickLocation(p.conn, location);
        if (!confirm) {
          return text(
            `PREVIEW ONLY — nothing was queued. Re-run with confirm=true.\n\nProject: ${p.label}\nLocation: ${loc.title}\nStatus: ${status}\n\n${replies.map((r) => `• ${r.reviewer ?? r.reviewId}${r.stars ? ` (${r.stars}★)` : ""}: ${r.reply}`).join("\n")}`
          );
        }
        const res = await queueReplies(p.id, loc.name, replies, status, { onlyNew });
        return json({ project: p.label, location: loc.title, ...res, queue: await replyQueueStats(p.id) });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "gbp_reply_queue",
    {
      title: "Google Business — Reply Queue Status",
      description: `Shows the review-reply queue: counts per status (approved = waiting, sent, skipped, failed, draft), replies sent in the last 24 hours, and the listed replies.

Args:
  - project (string, optional): limit to one project.
  - status (optional): approved | draft | sent | skipped | failed — which replies to list (default approved).
  - limit (number, optional): how many to list (default 20, max 100).`,
      inputSchema: {
        project: z.string().optional(),
        status: z.enum(["approved", "draft", "sent", "skipped", "failed"]).optional(),
        limit: intArg(1, 100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project, status = "approved", limit = 20 }: { project?: string; status?: QueueStatus; limit?: number }) => {
      try {
        const p = project ? await resolveConnected(project) : null;
        const items = await listQueuedReplies({ projectId: p?.id, status, limit });
        return json({
          project: p?.label ?? "all projects",
          counts: await replyQueueStats(p?.id),
          [status]: items.map((r) => ({ reviewer: r.reviewer, stars: r.stars, review: r.review_comment, reply: r.reply, created: r.review_created_at, sent_at: r.sent_at, error: r.last_error })),
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "gbp_request",
    {
      title: "Google Business Profile API — Passthrough",
      description: `Any Google Business Profile API call with a connected project's grant — posts (v4 localPosts), media, profile info (Business Information API), performance metrics (Business Profile Performance API), verifications, notifications, place actions, lodging. (Google shut the Q&A API down on 3 Nov 2025.)

Args:
  - project (string): project id or part of its label (see gbp_list_connections).
  - url (string): full https URL on a Business Profile API host, e.g. "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts" or "https://businessprofileperformance.googleapis.com/v1/locations/2:fetchMultiDailyMetricsTimeSeries?dailyMetrics=WEBSITE_CLICKS&dailyRange.startDate.year=2026&...".
  - method ("GET" | "POST" | "PATCH" | "PUT" | "DELETE"), body (object, optional).
  - confirm (boolean): required true for anything but GET, otherwise a preview is returned.

${PACE_NOTE}`,
      inputSchema: {
        project: z.string().min(1),
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).optional(),
        body: z.record(z.string(), z.any()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ project, url, method = "GET", body, confirm }: { project: string; url: string; method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: Record<string, unknown>; confirm?: boolean }) => {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname)) throw new Error(`Only Business Profile API hosts are allowed: ${ALLOWED_HOSTS.join(", ")}`);
        const p = await resolveConnected(project);
        if (method !== "GET" && !confirm) return text(`PREVIEW ONLY — nothing was sent. Re-run with confirm=true to execute.\n\n${JSON.stringify({ project: p.label, method, url, body: body ?? null }, null, 2)}`);
        const call = async () => {
          const res = await fetch(u.toString(), {
            method,
            headers: { Authorization: `Bearer ${await gbpAccessToken(p.id)}`, "Content-Type": "application/json" },
            body: body && method !== "GET" ? JSON.stringify(body) : undefined,
            cache: "no-store",
          });
          const raw = await res.text();
          const parsed = raw ? JSON.parse(raw) : {};
          if (!res.ok) throw new Error(parsed?.error?.message || `HTTP ${res.status}`);
          return parsed;
        };
        // Writes are paced per location (the "locations/…" id in the URL).
        const loc = u.pathname.match(/locations\/[^/:]+/)?.[0] ?? `project:${p.id}`;
        return json(method === "GET" ? await call() : await paceGbpWrite(loc, `api_${method.toLowerCase()}`, call));
      } catch (error) {
        return fail(error);
      }
    }
  );
}
