import { z } from "zod";
import sharp from "sharp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { fetchObject } from "./storage";
import { postImageLink } from "./post-image-links";

/**
 * Read-only Planner tools shared by the local (mcp/tools/social.ts) and remote
 * (lib/mcp-remote-tools.ts) MCP servers:
 *  - social_get_post_image_url: any post's image inline + a 15-minute link the
 *    user can open/download (no storage path, nothing public).
 *  - social_list_posts: every status, filterable, with per-project/per-status
 *    counts — the "how many did each client add / how many are scheduled" view.
 * Neither tool changes any post.
 */

const STATUSES = ["pending_caption", "needs_changes", "scheduled", "posted", "failed"] as const;
type Status = (typeof STATUSES)[number];

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const fail = (text: string) => ({ content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true as const });
const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));

type ProjectRow = { id: string; name: string; clients: { name: string } | { name: string }[] | null };
const clientName = (p: ProjectRow) => (Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "Unknown";
const label = (p: ProjectRow) => `${clientName(p)} — ${p.name}`;

async function projects(): Promise<ProjectRow[]> {
  const { data } = await db.from("client_projects").select("id, name, clients(name)");
  return (data ?? []) as ProjectRow[];
}

/** Images bigger than this (bytes or pixels) are re-encoded smaller for the inline preview only. */
const MAX_INLINE_BYTES = 1_500_000;
const MAX_INLINE_SIDE = 1600;

async function inlinePreview(buffer: Buffer, contentType: string): Promise<{ data: string; mimeType: string; resized: boolean }> {
  try {
    const meta = await sharp(buffer).metadata();
    const tooBig = buffer.length > MAX_INLINE_BYTES || (meta.width ?? 0) > MAX_INLINE_SIDE || (meta.height ?? 0) > MAX_INLINE_SIDE;
    if (!tooBig) return { data: buffer.toString("base64"), mimeType: contentType, resized: false };
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: MAX_INLINE_SIDE, height: MAX_INLINE_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return { data: out.toString("base64"), mimeType: "image/jpeg", resized: true };
  } catch {
    return { data: buffer.toString("base64"), mimeType: contentType, resized: false };
  }
}

/** Who uploaded it — never an email address. */
function uploaderName(uploadedByEmail: string | null, project: ProjectRow | undefined) {
  if (!uploadedByEmail) return "Shoaib (dashboard)";
  return `${project ? clientName(project) : "Client"} (client portal)`;
}

const pkt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "no date";

export function registerPostListingTools(server: McpServer): void {
  server.registerTool(
    "social_get_post_image_url",
    {
      title: "Get Post Image + Download Link",
      description: `Shows ANY Planner post's image to the user (inline, in the chat) and gives a short-lived link (15 minutes) they can open or download. Works for every status: pending_caption, needs_changes (held), scheduled, posted, failed.

Use this whenever the user wants to SEE a post, get the file, or a link to it ("show me the held post 17.png of Avenza Avenue"). Find the postId with social_list_posts (filter by project/status) first. For captioning work, social_get_post_image is enough.

Args:
  - postId (string, UUID)

Returns: the image (large ones are shrunk for the preview only — the link serves the original), plus filename, project_label, status, scheduled_at, caption, the needs-changes note (if held), uploader (a name, never an email), and the view/download links with their expiry.`,
      inputSchema: { postId: z.string().uuid() },
      annotations: READ,
    },
    async ({ postId }: { postId: string }) => {
      try {
        const { data: post } = await db
          .from("scheduled_posts")
          .select("id, project_id, media_key, cover_key, original_filename, caption, status, scheduled_at, review_note, uploaded_by_email, post_type")
          .eq("id", postId)
          .maybeSingle();
        if (!post) return fail(`No post found with id '${postId}'.`);
        const all = await projects();
        const project = all.find((p) => p.id === post.project_id);
        const isVideo = post.post_type === "reel" || /\.(mp4|mov)$/i.test(post.media_key as string);
        const previewKey = isVideo ? (post.cover_key as string | null) : (post.media_key as string);

        let preview: Awaited<ReturnType<typeof inlinePreview>> | null = null;
        let previewNote = "";
        if (previewKey) {
          try {
            const file = await fetchObject(previewKey);
            preview = await inlinePreview(file.buffer, file.contentType);
            if (preview.resized) previewNote = " (preview shrunk — the link serves the original)";
          } catch {
            previewNote = " — image missing from storage";
          }
        } else {
          previewNote = isVideo ? " — video with no cover image (the link serves the video)" : " — no image stored";
        }

        const link = postImageLink(post.id as string, post.original_filename as string);
        const details = {
          id: post.id,
          filename: post.original_filename,
          project_label: project ? label(project) : "Unknown project",
          status: post.status,
          scheduled_at: post.scheduled_at,
          caption: post.caption ?? null,
          needs_changes: post.status === "needs_changes" ? (post.review_note ?? "(no note)") : null,
          uploader: uploaderName(post.uploaded_by_email as string | null, project),
          view_url: link.view,
          download_url: link.download,
          link_expires_at: link.expiresAt,
        };
        const text = [
          `**${details.filename}** — ${details.project_label}${previewNote}`,
          `Status: ${details.status}${details.needs_changes ? ` — needs changes: ${details.needs_changes}` : ""}`,
          `Scheduled: ${pkt(details.scheduled_at as string | null)} (PKT)`,
          `Uploaded by: ${details.uploader}`,
          `Caption: ${details.caption ? String(details.caption) : "(none yet)"}`,
          "",
          `Open: ${link.view}`,
          `Download: ${link.download}`,
          `(links expire in 15 minutes — ${link.expiresAt})`,
        ].join("\n");
        return {
          content: [
            { type: "text" as const, text },
            ...(preview ? [{ type: "image" as const, data: preview.data, mimeType: preview.mimeType }] : []),
          ],
          structuredContent: details,
        };
      } catch (error) {
        return fail(formatError(error));
      }
    }
  );

  server.registerTool(
    "social_list_posts",
    {
      title: "List Planner Posts (any status)",
      description: `Lists Planner posts of ANY status — pending_caption, needs_changes (held), scheduled, posted, failed — newest first, plus a summary: counts per project and per status, and how many each project added in the last 7 days. No images (light).

Use it for questions like "how many posts did each client add this week?", "what is still not scheduled?", "show Avenza's held posts". Then use social_get_post_image_url to show a post's image or give a download link. (social_list_pending_posts only covers pending_caption — this one covers everything.)

Args (all optional):
  - project (string): fuzzy match on the project or "Client — Project" name, e.g. "Avenza". Matches every project that contains it.
  - status (string or string[]): one or more of ${STATUSES.join(", ")}.
  - from / to (string, ISO date or datetime): range filter on dateField.
  - dateField ("created_at" | "scheduled_at", default "created_at"): which date from/to apply to. created_at = when it was added.
  - limit (number, default 50, max 200): rows returned (the summary always covers every match).

Returns (JSON): { total, summary: { by_project: [{ project_label, total, added_last_7_days, by_status }], by_status }, posts: [{ id, project_label, filename, status, scheduled_at, created_at, caption_preview, needs_changes }] }`,
      inputSchema: {
        project: z.string().min(1).max(120).optional(),
        status: z.union([z.enum(STATUSES), z.array(z.enum(STATUSES)).min(1)]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        dateField: z.enum(["created_at", "scheduled_at"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ,
    },
    async ({
      project,
      status,
      from,
      to,
      dateField = "created_at",
      limit = 50,
    }: {
      project?: string;
      status?: Status | Status[];
      from?: string;
      to?: string;
      dateField?: "created_at" | "scheduled_at";
      limit?: number;
    }) => {
      try {
        const parseDate = (v: string | undefined, name: string) => {
          if (!v) return null;
          const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:00` : v);
          if (Number.isNaN(d.getTime())) throw new Error(`Bad ${name} date "${v}" — use ISO, e.g. 2026-10-01 or 2026-10-01T09:00:00+05:00.`);
          return d.toISOString();
        };
        const fromIso = parseDate(from, "from");
        // A bare "to" date includes that whole day.
        const toIso = to ? (/^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(new Date(`${to}T00:00:00+05:00`).getTime() + 86400000).toISOString() : parseDate(to, "to")) : null;

        const all = await projects();
        const byId = new Map(all.map((p) => [p.id, p]));
        let projectIds: string[] | null = null;
        if (project) {
          const needle = project.toLowerCase();
          projectIds = all.filter((p) => p.name.toLowerCase().includes(needle) || label(p).toLowerCase().includes(needle)).map((p) => p.id);
          if (!projectIds.length) return fail(`No project matches "${project}".`);
        }
        const statuses = status ? (Array.isArray(status) ? status : [status]) : null;

        // One light query for the summary (every match), one for the rows (limited).
        const base = (cols: string) => {
          let q = db.from("scheduled_posts").select(cols);
          if (projectIds) q = q.in("project_id", projectIds);
          if (statuses) q = q.in("status", statuses);
          if (fromIso) q = q.gte(dateField, fromIso);
          if (toIso) q = q.lt(dateField, toIso);
          return q;
        };
        const [{ data: summaryRows, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
          base("project_id, status, created_at").limit(10000),
          base("id, project_id, original_filename, status, scheduled_at, created_at, caption, review_note")
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);
        if (e1 || e2) throw new Error((e1 ?? e2)!.message);

        const weekAgo = Date.now() - 7 * 86400000;
        const perProject = new Map<string, { project_label: string; total: number; added_last_7_days: number; by_status: Record<string, number> }>();
        const byStatus: Record<string, number> = {};
        for (const r of (summaryRows ?? []) as unknown as { project_id: string; status: string; created_at: string }[]) {
          const p = byId.get(r.project_id);
          const entry = perProject.get(r.project_id) ?? { project_label: p ? label(p) : "Unknown project", total: 0, added_last_7_days: 0, by_status: {} };
          entry.total++;
          if (new Date(r.created_at).getTime() >= weekAgo) entry.added_last_7_days++;
          entry.by_status[r.status] = (entry.by_status[r.status] ?? 0) + 1;
          perProject.set(r.project_id, entry);
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        }
        const summary = { by_project: [...perProject.values()].sort((a, b) => b.total - a.total), by_status: byStatus };

        const posts = ((rows ?? []) as unknown as {
          id: string;
          project_id: string;
          original_filename: string;
          status: string;
          scheduled_at: string | null;
          created_at: string;
          caption: string | null;
          review_note: string | null;
        }[]).map((r) => {
          const p = byId.get(r.project_id);
          return {
            id: r.id,
            project_label: p ? label(p) : "Unknown project",
            filename: r.original_filename,
            status: r.status,
            scheduled_at: r.scheduled_at,
            created_at: r.created_at,
            caption_preview: r.caption ? (r.caption.length > 80 ? `${r.caption.slice(0, 80)}…` : r.caption) : null,
            needs_changes: r.status === "needs_changes",
          };
        });
        const total = (summaryRows ?? []).length;

        const lines = [`# Posts (${total} match${total === 1 ? "" : "es"}, showing ${posts.length})`, "", "## Summary"];
        for (const p of summary.by_project) {
          const parts = Object.entries(p.by_status).map(([k, v]) => `${v} ${k}`);
          lines.push(`- **${p.project_label}**: ${p.total} total (${parts.join(", ")}) — ${p.added_last_7_days} added in the last 7 days`);
        }
        lines.push(`- By status: ${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}`, "", "## Posts (newest first)");
        for (const r of posts) {
          lines.push(`- \`${r.id}\` — ${r.project_label} — ${r.filename} — ${r.status}${r.needs_changes ? " ⚠ held" : ""} — scheduled ${pkt(r.scheduled_at)}`);
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }], structuredContent: { total, summary, posts } };
      } catch (error) {
        return fail(formatError(error));
      }
    }
  );
}
