import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { listPendingCaptionPosts, getScheduledPost, setCaptionAndSchedule } from "./scheduled-posts";
import { fetchObject } from "./storage";
import { submitNativeScheduleForPost } from "./social-post";

/**
 * The remote (Claude web/mobile/desktop) counterpart to mcp/tools/social.ts
 * — deliberately a small starting subset (list → view image → caption +
 * schedule), not the full local toolset, per Shoaib's "start small" call.
 * Registered onto a fresh McpServer per request (app/api/mcp/route.ts runs
 * stateless on Vercel), so this stays cheap to construct.
 */

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

type ProjectRow = {
  id: string;
  name: string;
  posting_instructions: string | null;
  clients: { name: string } | { name: string }[] | null;
};

function projectLabel(p: ProjectRow): string {
  const clientName = Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name;
  return `${clientName ?? "Unknown"} — ${p.name}`;
}

async function projectContextMap(): Promise<Map<string, { label: string; postingInstructions: string | null }>> {
  const { data } = await db.from("client_projects").select("id, name, posting_instructions, clients(name)");
  const rows = (data ?? []) as ProjectRow[];
  return new Map(rows.map((p) => [p.id, { label: projectLabel(p), postingInstructions: p.posting_instructions }]));
}

export function registerRemoteSocialTools(server: McpServer): void {
  server.registerTool(
    "social_list_pending_posts",
    {
      title: "List Pending-Caption Posts",
      description: `Lists images uploaded via the Planner calendar that still need a caption (status='pending_caption').

For each, use social_get_post_image to view the image (which also returns that project's posting style guide, if one is set — follow it when writing the caption), then social_set_caption_and_schedule to finish it.

Returns (JSON): { count, posts: [{ id, project_label, original_filename, scheduled_at, posting_instructions }] }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [posts, projects] = await Promise.all([listPendingCaptionPosts(), projectContextMap()]);
        const rows = posts.map((p) => {
          const ctx = projects.get(p.project_id);
          return {
            id: p.id,
            project_label: ctx?.label ?? "Unknown project",
            original_filename: p.original_filename,
            scheduled_at: p.scheduled_at,
            posting_instructions: ctx?.postingInstructions ?? null,
          };
        });
        const lines = [`# Pending posts (${rows.length})`, ""];
        for (const r of rows) {
          lines.push(`- \`${r.id}\` — **${r.project_label}** — ${r.original_filename} (${r.scheduled_at ?? "no date set"})`);
          if (r.posting_instructions) lines.push(`  Posting style: ${r.posting_instructions}`);
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: { count: rows.length, posts: rows },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_get_post_image",
    {
      title: "Get Post Image",
      description: `Fetches the actual image for a pending/queued post so you can read any text in it (OCR) and write a caption. Also returns that post's project posting style guide, if one is set — follow it (emoji use, tone, language, do's and don'ts) when writing the caption, without needing to be told again.

Args:
  - postId (string, UUID): from social_list_pending_posts.

Returns: the image itself (view it directly), plus the post's original filename and posting style guide as text.`,
      inputSchema: { postId: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ postId }: { postId: string }) => {
      try {
        const post = await getScheduledPost(postId);
        if (!post) return { content: [{ type: "text", text: `Error: No post found with id '${postId}'.` }], isError: true };
        const [{ buffer, contentType }, projects] = await Promise.all([fetchObject(post.media_key), projectContextMap()]);
        const ctx = projects.get(post.project_id);
        const styleText = ctx?.postingInstructions
          ? `Posting style for ${ctx.label}: ${ctx.postingInstructions}`
          : `No posting style guide set for ${ctx?.label ?? "this project"} — use your own judgement.`;
        return {
          content: [
            { type: "text", text: `File: ${post.original_filename}\n${styleText}` },
            { type: "image", data: buffer.toString("base64"), mimeType: contentType },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_set_caption_and_schedule",
    {
      title: "Set Caption And Schedule",
      description: `Finishes a pending-caption post: sets its caption and moves it to status='scheduled'. The cron that actually publishes runs every 15 minutes and fires anything whose scheduled time has passed.

Args:
  - postId (string, UUID)
  - caption (string): the caption to post.
  - scheduledAt (string, ISO datetime, optional): overrides the date the post was uploaded onto in the planner calendar. Omit to keep that date.

Returns: confirmation text.`,
      inputSchema: {
        postId: z.string().uuid(),
        caption: z.string().min(1).max(2200),
        scheduledAt: z.string().datetime().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ postId, caption, scheduledAt }: { postId: string; caption: string; scheduledAt?: string }) => {
      try {
        const post = await getScheduledPost(postId);
        if (!post) return { content: [{ type: "text", text: `Error: No post found with id '${postId}'.` }], isError: true };
        if (!scheduledAt && !post.scheduled_at) {
          return {
            content: [{ type: "text", text: "Error: This post has no date guess from its filename — pass scheduledAt explicitly." }],
            isError: true,
          };
        }
        await setCaptionAndSchedule(postId, caption, scheduledAt);
        // Best-effort: hand any eligible Facebook account straight to
        // Meta's own scheduler now rather than waiting for the cron.
        await submitNativeScheduleForPost(postId);
        return { content: [{ type: "text", text: `Scheduled for ${scheduledAt ?? post.scheduled_at}.` }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
