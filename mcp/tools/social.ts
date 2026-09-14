import { z } from "zod";
import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "../../lib/dashboard/db.js";
import { listAllSocialAccounts } from "../../lib/social-accounts.js";
import {
  listPendingCaptionPosts,
  listScheduledPosts,
  getScheduledPost,
  setCaptionAndSchedule,
} from "../../lib/scheduled-posts.js";
import { uploadObject, fetchObject, presignDownload } from "../../lib/storage.js";
import { postToAllProjectAccounts, submitNativeScheduleForPost } from "../../lib/social-post.js";

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type ProjectRow = {
  id: string;
  name: string;
  client_id: string;
  posting_instructions: string | null;
  clients: { name: string } | { name: string }[] | null;
};

function projectLabel(p: ProjectRow): string {
  const clientName = Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name;
  return `${clientName ?? "Unknown"} — ${p.name}`;
}

type ProjectContext = { label: string; postingInstructions: string | null };

async function projectContextMap(): Promise<Map<string, ProjectContext>> {
  const { data } = await db.from("client_projects").select("id, name, client_id, posting_instructions, clients(name)");
  const rows = (data ?? []) as ProjectRow[];
  return new Map(rows.map((p) => [p.id, { label: projectLabel(p), postingInstructions: p.posting_instructions }]));
}

/** Back-compat thin wrapper for call sites that only need the label. */
async function projectLabelMap(): Promise<Map<string, string>> {
  const ctx = await projectContextMap();
  return new Map([...ctx.entries()].map(([id, c]) => [id, c.label]));
}

/** Fuzzy-matches a project by its own name or the combined "Client — Project"
 *  label (posting binds to a project, not a client — see the note in
 *  supabase/dashboard-schema.sql). */
async function findProjectByName(name: string): Promise<{ id: string; label: string }> {
  const { data } = await db.from("client_projects").select("id, name, client_id, posting_instructions, clients(name)");
  const rows = (data ?? []) as ProjectRow[];
  const needle = name.toLowerCase();
  const matches = rows.filter(
    (p) => p.name.toLowerCase().includes(needle) || projectLabel(p).toLowerCase().includes(needle)
  );
  if (matches.length === 0) {
    throw new Error(`No project matches "${name}". Every client needs at least one project (client_projects row) to use the social poster.`);
  }
  if (matches.length > 1) {
    throw new Error(`"${name}" matches multiple projects: ${matches.map(projectLabel).join(", ")}. Be more specific.`);
  }
  return { id: matches[0].id, label: projectLabel(matches[0]) };
}

export function registerSocialTools(server: McpServer): void {
  server.registerTool(
    "social_list_pending_posts",
    {
      title: "List Pending-Caption Posts",
      description: `Lists images uploaded via the /dashboard/social/planner calendar that still need a caption (status='pending_caption') — the date is already set from the calendar day they were dropped on.

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

  server.registerTool(
    "social_list_queue",
    {
      title: "List Social Queue",
      description: `Lists all queued/scheduled/posted/failed posts, optionally filtered to one project.

Args:
  - projectName (string, optional): fuzzy-matched against the project name or "Client — Project" label.

Returns (JSON): { count, posts: [{ id, project_label, status, caption, scheduled_at, original_filename }] }`,
      inputSchema: { projectName: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ projectName }: { projectName?: string }) => {
      try {
        const project = projectName ? await findProjectByName(projectName) : null;
        const [posts, labels] = await Promise.all([listScheduledPosts(project?.id), projectLabelMap()]);
        const rows = posts.map((p) => ({
          id: p.id,
          project_label: labels.get(p.project_id) ?? "Unknown project",
          status: p.status,
          caption: p.caption,
          scheduled_at: p.scheduled_at,
          original_filename: p.original_filename,
        }));
        return {
          content: [{ type: "text", text: rows.map((r) => `- \`${r.id}\` [${r.status}] ${r.project_label} — ${r.scheduled_at ?? "unscheduled"}`).join("\n") || "Queue is empty." }],
          structuredContent: { count: rows.length, posts: rows },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_list_accounts",
    {
      title: "List Connected Social Accounts",
      description: `Lists which projects have which social platforms connected.

Returns (JSON): { count, accounts: [{ project_label, platform, label }] }`,
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const [accounts, labels] = await Promise.all([listAllSocialAccounts(), projectLabelMap()]);
        const rows = accounts.map((a) => ({
          project_label: labels.get(a.project_id) ?? "Unknown project",
          platform: a.platform,
          label: a.label,
        }));
        return {
          content: [{ type: "text", text: rows.map((r) => `- **${r.project_label}** — ${r.platform} (${r.label})`).join("\n") || "No accounts connected yet." }],
          structuredContent: { count: rows.length, accounts: rows },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_post_now",
    {
      title: "Post Now",
      description: `Immediately posts a local image to every connected social account for one project (bypasses the schedule queue — for ad-hoc "post this right now" requests).

Args:
  - projectName (string): fuzzy-matched against the project name or "Client — Project" label.
  - caption (string)
  - imagePath (string): local file path (jpg/jpeg/png/webp).

Returns (JSON): per-platform results.`,
      inputSchema: {
        projectName: z.string(),
        caption: z.string().min(1).max(2200),
        imagePath: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ projectName, caption, imagePath }: { projectName: string; caption: string; imagePath: string }) => {
      try {
        const project = await findProjectByName(projectName);
        const ext = extname(imagePath).toLowerCase();
        const contentType = CONTENT_TYPES[ext];
        if (!contentType) throw new Error(`Unsupported image extension "${ext}".`);

        const bytes = await readFile(imagePath);
        const key = `social/${project.id}/adhoc-${Date.now()}-${basename(imagePath)}`;
        await uploadObject(key, bytes, contentType);
        const imageUrl = await presignDownload(key);

        const results = await postToAllProjectAccounts(project.id, imageUrl, caption, key);
        const lines = results.map((r) => (r.ok ? `✓ ${r.platform} (${r.label}) — post id ${r.post_id}` : `✗ ${r.platform} (${r.label}) — ${r.error}`));
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: { project: project.label, results },
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
