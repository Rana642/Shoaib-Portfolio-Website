import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearPostFlag, flagPostsForChanges } from "./post-review";
import { deleteScheduledPost, getScheduledPost } from "./scheduled-posts";
import { cancelNativeScheduleStrict } from "./social-post";
import { deleteObject } from "./storage";

/**
 * Planner tools shared by the remote MCP (lib/mcp-remote-tools.ts) and the
 * local one (mcp/tools/social.ts) so both stay in step: "needs changes",
 * and removing a wrong upload.
 */

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

export function registerPostReviewTools(server: McpServer): void {
  server.registerTool(
    "social_request_changes",
    {
      title: "Request Changes On Posts",
      description: `Holds planner posts that have a mistake (instead of scheduling them) and tells whoever uploaded them exactly what to fix.

Always check every pending post with social_get_post_image BEFORE captioning or scheduling. Check:
  - the right project (logo, phone, address and email match the brand);
  - the right day (Jummah/occasion posts on their date, the Friday rule);
  - small text inside photos (e.g. a "DHA Multan" ad whose gate photo says "DHA PESHAWAR");
  - icons and imagery that suit the audience (e.g. no cross on a graveyard icon for a Muslim audience);
  - no stock photo shown as the client's own place.
Flag the ones with mistakes here, then schedule the rest.

Each flagged post becomes status 'needs_changes'. The uploader sees it on their portal Planner (a popup, a banner and a badge on the post) and gets ONE email per call listing all of their flagged posts, with a copy to Shoaib. They use "Replace image" (same day, same slot), and the post comes back to social_list_pending_posts. Posts Shoaib uploaded himself only show the flag on his own Planner.

Args:
  - posts: [{ postId, issue }], 1–30, all flagged in one batch. issue is plain English for the client's designer: say what is wrong AND what to do, e.g. "The gate photo says 'DHA PESHAWAR' on the guard house, but this post is for DHA Multan. Please use a DHA Multan gate photo."
  - notify (boolean, default true): false flags without emailing.

Returns: the posts flagged, any skipped (and why), and the emails sent.`,
      inputSchema: {
        posts: z.array(z.object({ postId: z.string().uuid(), issue: z.string().trim().min(10).max(1000) })).min(1).max(30),
        notify: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ posts, notify }: { posts: { postId: string; issue: string }[]; notify?: boolean }) => {
      try {
        const out = await flagPostsForChanges(posts, { notify: notify ?? true });
        const lines = [
          `Flagged ${out.flagged.length} post${out.flagged.length === 1 ? "" : "s"} as needing changes:`,
          ...out.flagged.map((f) => `- ${f.project} — ${f.filename} (${f.uploadedBy ? `uploaded by ${f.uploadedBy}` : "uploaded by Shoaib — no email"})`),
          ...(out.skipped.length ? ["", "Skipped:", ...out.skipped.map((s) => `- \`${s.postId}\`: ${s.reason}`)] : []),
          ...(out.emails.length
            ? ["", "Emails:", ...out.emails.map((e) => `- ${e.to}: ${e.posts} post${e.posts === 1 ? "" : "s"} — ${e.sent ? "sent" : `NOT sent (${e.error})`}`)]
            : []),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }], structuredContent: out };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_delete_post",
    {
      title: "Delete A Planner Post",
      description: `Removes a planner post that should not go out at all (a wrong upload): cancels its Facebook scheduled draft first, then deletes the post and its image. Only when Shoaib asks for a post to be removed — for a fixable mistake use social_request_changes instead.

Refuses a post that is already posted (it is live — delete it on the platform). If a Facebook draft can't be confirmed cancelled, nothing is deleted and the error says why.

Args:
  - postId (string, UUID)

Returns: confirmation text.`,
      inputSchema: { postId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ postId }: { postId: string }) => {
      try {
        const post = await getScheduledPost(postId);
        if (!post) return { content: [{ type: "text", text: "Already gone — no post with this id." }] };
        if (post.status === "posted") {
          return { content: [{ type: "text", text: "Error: This post is already live — delete it on the platform itself." }], isError: true };
        }
        const cancelled = await cancelNativeScheduleStrict(postId);
        await deleteScheduledPost(postId);
        for (const key of [post.media_key, post.cover_key].filter((k): k is string => Boolean(k))) await deleteObject(key).catch(() => {});
        return {
          content: [
            {
              type: "text",
              text: `Deleted ${post.original_filename} (was ${post.status}${post.scheduled_at ? `, ${post.scheduled_at}` : ""}).${cancelled ? ` Cancelled ${cancelled} Facebook scheduled draft${cancelled === 1 ? "" : "s"}.` : ""}`,
            },
          ],
        };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "social_clear_changes",
    {
      title: "Clear A Needs-Changes Flag",
      description: `Puts a 'needs_changes' post back to 'pending_caption' with its current image — when Shoaib decides it can go out as it is. (When the uploader replaces the image, this happens on its own.)

Args:
  - postId (string, UUID)

Returns: confirmation text.`,
      inputSchema: { postId: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ postId }: { postId: string }) => {
      try {
        await clearPostFlag(postId);
        return { content: [{ type: "text", text: "Cleared — the post is waiting for a caption again." }] };
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
