import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { verifyDriveImport } from "./planner-drive";
import { addPlannerPost, importDriveFolder, loadMedia, pickPlatforms, connectedPlatforms, pktWhen, resolveProject, updatePlannerPost, type AddPostResult } from "./planner-intake";
import { publishNow } from "./social-publish-now";
import { plannerUploadUrl, signPlannerUploadToken } from "./kb-files";
import type { Finding } from "./post-preflight-checks";
import { applyAuditAction, auditPlanner, fixSafeAuditItems, type AuditItem } from "./planner-audit";

/**
 * Planner work from a chat (ChatGPT or Claude), Shoaib 2026-11-09: put a
 * picture or video on a project's planner, a whole Drive folder, change a
 * post, or hand out an upload link when the chat can't pass the file. Same
 * rules as the dashboard (lib/planner-intake.ts).
 */

export const PLANNER_INSTRUCTIONS =
  "Planner from the chat (social_* tools): social_add_post puts one picture or video on a project's planner (pass the chat's file as `file`, or a link as `url`; a Google Drive file link works). A whole Drive folder goes with social_import_drive_folder: call it first without confirm, show the user the list, and import only after they say yes. social_update_post changes a post's day, time, platforms or kind; social_set_caption_and_schedule its caption; social_publish_now publishes it at once. When a file from the chat can't be passed (or the tool says the file didn't arrive), use social_create_upload_link and give the user the link. After any upload, run social_audit_planner and show the user what it found (a Drive import checks its own folder at the end); social_audit_fix applies one item (a Remove only after the user says yes). Duplicates are judged by content, never by file name. Before publishNow (or social_publish_now), tell the user the project, platforms and caption and get a clear yes. The caption and the words on a picture are the approved words from the knowledge base (Content is OURS); never invent them.";

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true });

const findingLines = (items: Finding[]) => items.map((f) => `- ${f.severity.toUpperCase()}: ${f.en} (${f.ur})`).join("\n");
const platformText = (list: string[]) => (list.length ? list.join(", ") : "none connected yet (it waits)");
const KIND_LABEL = { post: "picture post", reel: "Reel", story: "Story", video: "video" } as const;

function addedText(project: string, r: AddPostResult): string {
  const lines = [
    `${r.status === "scheduled" ? "Scheduled" : "Added, waiting for a caption"}: ${r.name} on ${project}`,
    `- postId: ${r.postId}`,
    `- kind: ${KIND_LABEL[r.kind]}`,
    `- when: ${pktWhen(r.scheduledAt)}`,
    `- platforms: ${platformText(r.platforms)}`,
  ];
  if (r.fixes.length) lines.push("", "Fix first:", findingLines(r.fixes));
  if (r.checks.length) lines.push("", "Check:", findingLines(r.checks));
  if (r.notes.length) lines.push("", ...r.notes.map((n) => `Note: ${n}`));
  return lines.join("\n");
}

const kindSchema = z.enum(["post", "reel", "story", "video"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM (24-hour, Pakistan time)");
const platformsSchema = z.array(z.string().min(2).max(40)).min(1).max(10);
// What ChatGPT passes for a file listed in _meta["openai/fileParams"].
const chatFileSchema = z
  .object({
    download_url: z.string().url(),
    file_id: z.string(),
    mime_type: z.string().nullish(),
    file_name: z.string().nullish(),
  })
  .passthrough();

export function registerPlannerTools(server: McpServer): void {
  server.registerTool(
    "social_add_post",
    {
      title: "Add a post to the Planner",
      description: `Puts one picture or video on a client project's Planner — the same as uploading it on the dashboard, with the same rules.

The file: \`file\` = a picture/video the user sent or you made in this chat (ChatGPT passes it here), or \`url\` = a link to it (a Google Drive FILE link, or any public https link). Pictures: JPG/PNG/WebP up to 25 MB. Videos: MP4/MOV up to 100 MB. For a whole Drive FOLDER use social_import_drive_folder. If the file can't be passed, use social_create_upload_link.

Args:
  - project: project name, "Client — Project" or id.
  - postType: post (picture) | reel | story | video. Default: post for a picture, reel for a video.
  - date (YYYY-MM-DD) and time (HH:MM, 24-hour, Pakistan time). No date = the next free day; no time = the usual 10:00 AM slot. Must be ahead.
  - platforms: e.g. ["facebook","instagram"]. Default: every connected platform that takes this kind (a video only where its length fits).
  - caption: the APPROVED caption. With it the post is scheduled unless a pre-flight FIX item is found (then it waits, findings returned). Without it the post waits for social_set_caption_and_schedule. Stories need no caption.
  - videoTitle / videoPrivacy: for YouTube.
  - publishNow: true publishes it at once after the checks (only after the user said yes). CHECK items stop it until confirmChecks is true.
  - fileName: optional name for the file (a file of the same name already on the project's planner is refused as a duplicate).

Returns the postId, kind, time (PKT), platforms, status and any findings.`,
      inputSchema: {
        project: z.string().min(2).max(200),
        file: chatFileSchema.optional(),
        url: z.string().url().max(2000).optional(),
        fileName: z.string().min(1).max(150).optional(),
        postType: kindSchema.optional(),
        date: dateSchema.optional(),
        time: timeSchema.optional(),
        platforms: platformsSchema.optional(),
        caption: z.string().max(2200).optional(),
        videoTitle: z.string().max(100).optional(),
        videoPrivacy: z.enum(["public", "unlisted", "private"]).optional(),
        publishNow: z.boolean().optional(),
        confirmChecks: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { "openai/fileParams": ["file"] },
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project);
        const media = await loadMedia({ file: args.file, url: args.url, fileName: args.fileName });
        const added = await addPlannerPost({
          projectId: project.id,
          media,
          date: args.date,
          time: args.time,
          platforms: args.platforms ?? null,
          postType: args.postType ?? null,
          caption: args.caption,
          videoTitle: args.videoTitle,
          videoPrivacy: args.videoPrivacy,
          publishingNow: args.publishNow === true,
        });
        const text = addedText(project.label, added);
        if (!args.publishNow) return ok(text);
        if (added.status !== "scheduled") return ok(`${text}\n\nNot published: it isn't ready (see above).`);

        const res = await publishNow(added.postId, args.confirmChecks ?? false);
        if (res.status === "published") {
          const lines = res.platforms.map((p) => `- ${p.platform} ${p.label}: ${p.ok ? "OK" : `FAILED ${p.error ?? ""}`}`).join("\n");
          return ok(`${res.ok ? "Published" : "Published with problems"}: ${added.name} on ${project.label} (postId ${added.postId}).${res.note ? ` ${res.note}` : ""}\n${lines}`);
        }
        if (res.status === "confirm") {
          return ok(`${text}\n\nNot published yet; it stays scheduled for ${pktWhen(added.scheduledAt)}. Look at these, then call social_publish_now with postId ${added.postId} and confirmChecks true if they are fine:\n${findingLines(res.findings)}`);
        }
        if (res.status === "blocked") {
          // Not left to go out later with a FIX on it.
          await db.from("scheduled_posts").update({ status: "pending_caption" }).eq("id", added.postId);
          return ok(`${text}\n\nNot published, and taken off the schedule until fixed:\n${findingLines(res.findings)}`);
        }
        return ok(`${text}\n\nNot published: ${res.message} It stays scheduled for ${pktWhen(added.scheduledAt)}.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "social_import_drive_folder",
    {
      title: "Import a Google Drive folder to the Planner",
      description: `Bulk upload from a shared Google Drive folder ("Anyone with the link") onto a project's Planner, with the dashboard's Bulk upload rules: pictures become posts, MP4/MOV videos become Reels, one free day per file from startDate (Fridays kept for files named "friday"), files already on the planner skipped, each video only to platforms its length fits. They wait for captions afterwards.

Call it first WITHOUT confirm: it lists what would be imported and what is skipped. Show the user, and call again with confirm true only after they say yes. A big folder goes in parts: if "remaining" is above 0, call again with the same arguments to continue.

Args: project, folderLink, startDate (YYYY-MM-DD, default tomorrow), platforms (default all connected), confirm.`,
      inputSchema: {
        project: z.string().min(2).max(200),
        folderLink: z.string().min(10).max(500),
        startDate: dateSchema.optional(),
        platforms: platformsSchema.optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project);
        const res = await importDriveFolder({ projectId: project.id, link: args.folderLink, startDate: args.startDate, platforms: args.platforms ?? null, confirm: args.confirm === true, budgetMs: 25_000 });
        const pictures = res.ready.filter((f) => f.kind === "post").length;
        const videos = res.ready.length - pictures;
        const skipped = res.skipped.length ? `\n\nSkipped (${res.skipped.length}):\n${res.skipped.slice(0, 40).map((s) => `- ${s}`).join("\n")}` : "";
        const sameName = res.nameNotes.length ? `\n\nSame name as an older post but a different file, so imported (worth a look): ${res.nameNotes.join(", ")}` : "";
        if (res.mode === "list") {
          const names = res.ready.slice(0, 60).map((f) => `- ${f.name} (${f.kind === "post" ? "picture" : "Reel"} → ${platformText(f.platforms)})`).join("\n");
          return ok(`${project.label}: ${pictures} picture(s) and ${videos} video(s) ready to import.${res.ready.length ? `\n${names}${res.ready.length > 60 ? `\n…and ${res.ready.length - 60} more` : ""}` : ""}${skipped}${sameName}\n\nNothing imported yet. After the user says yes, call again with confirm true.`);
        }
        const done = res.imported.map((f) => `- ${f.name} → ${f.date}`).join("\n");
        const failed = res.failed.length ? `\n\nNot imported:\n${res.failed.map((s) => `- ${s}`).join("\n")}` : "";
        let more = `\n\n${res.remaining} file(s) left: call again with the same arguments to continue.`;
        if (res.remaining === 0) {
          // Every file of the folder on the planner now? By Drive id or content, never by name.
          const check = await verifyDriveImport(project.id, args.folderLink).catch(() => null);
          more = !check
            ? "\n\nThe folder check after the import didn't run; call this again (without confirm) to see what is left."
            : check.leftBehind.length
              ? `\n\nNot on the planner yet: ${check.leftBehind.join(", ")}. Call again with confirm true to try them again.`
              : `\n\nChecked: all ${check.total} file(s) of the folder are on the planner. They wait for captions (social_list_pending_posts).`;
          if (check?.cantTake.length) more += ` Can't go on the planner: ${check.cantTake.join(", ")}.`;
        }
        return ok(`${project.label}: imported ${res.imported.length}.${done ? `\n${done}` : ""}${failed}${skipped}${more}`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "social_update_post",
    {
      title: "Change a Planner post",
      description: `Changes a Planner post before it goes out: its day and/or time (Pakistan time), its platforms, or its kind (a picture: post ↔ story; a video: reel ↔ story ↔ video). The caption has its own tool (social_set_caption_and_schedule). A Facebook copy already handed to Meta's scheduler is redone to match. Find the postId with social_list_posts.

Args: postId, date (YYYY-MM-DD), time (HH:MM), platforms (a list, or "all" for every connected one that takes it), postType.`,
      inputSchema: {
        postId: z.string().uuid(),
        date: dateSchema.optional(),
        time: timeSchema.optional(),
        platforms: z.union([platformsSchema, z.literal("all")]).optional(),
        postType: kindSchema.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { post, platforms, findings, notes } = await updatePlannerPost(args);
        const lines = [
          `Updated ${post.original_filename} (postId ${post.id}):`,
          `- kind: ${KIND_LABEL[post.post_type ?? "post"]}`,
          `- when: ${post.scheduled_at ? pktWhen(post.scheduled_at) : "no date"}`,
          `- platforms: ${platformText(platforms)}`,
          `- status: ${post.status}`,
        ];
        if (findings.length) lines.push("", findingLines(findings));
        if (notes.length) lines.push("", ...notes.map((n) => `Note: ${n}`));
        return ok(lines.join("\n"));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "social_create_upload_link",
    {
      title: "Planner upload link",
      description: `Use when a picture or video in the chat can't be passed to social_add_post (or the user has it on their phone or PC). Returns a link, valid for 1 hour, where the user chooses the file(s); they land on the project's Planner with the settings given here and the same checks as social_add_post. Several files get one free day each.

Args: project, and optionally postType, date, time (Pakistan time), platforms, caption (the approved caption; used when one file is uploaded).`,
      inputSchema: {
        project: z.string().min(2).max(200),
        postType: kindSchema.optional(),
        date: dateSchema.optional(),
        time: timeSchema.optional(),
        platforms: platformsSchema.optional(),
        caption: z.string().max(2200).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project);
        if (args.time && !args.date) throw new Error("Give the date together with the time.");
        // Platform names are checked now, so a wrong one fails here and not on the upload page.
        if (args.platforms) pickPlatforms(args.postType ?? "post", await connectedPlatforms(project.id), args.platforms, null);
        const token = signPlannerUploadToken({
          p: project.id,
          d: args.date ?? null,
          t: args.time ?? null,
          pl: args.platforms ?? null,
          k: args.postType ?? null,
          c: args.caption ?? null,
        });
        return ok(`Upload link for ${project.label}, valid for 1 hour:\n${plannerUploadUrl(token)}\n\nAsk the user to open it and choose the file(s). The page shows what was added; social_list_posts shows it too.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  const itemLine = (i: AuditItem) =>
    `- [${i.severity.toUpperCase()}] ${i.title}${i.detail ? ` — ${i.detail}` : ""}${i.action && i.action.type !== "open" ? ` (key: ${i.key}${i.safe ? ", safe" : ""})` : i.action ? " (open it on the Planner)" : ""}`;

  server.registerTool(
    "social_audit_planner",
    {
      title: "Audit a project's Planner",
      description: `Checks a project's Planner against our rules, like the Audit button on the dashboard: the same content twice (by file content, never by name), platforms that can't take a post or aren't connected, the Friday rule (Jummah posts on Fridays only), two posts on one day and empty days, caption mistakes, posts waiting for a caption, missed and failed posts.

Run it after every upload or import and show the user the result. Each fixable item has a key: apply it with social_audit_fix. fixSafe true applies only the safe fixes (dropping a platform that can't take the post, taking emoji out of a caption; the words stay), nothing that removes or moves a post.

Args: project, fixSafe (optional).`,
      inputSchema: {
        project: z.string().min(2).max(200),
        fixSafe: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project);
        let note = "";
        if (args.fixSafe) {
          const first = await auditPlanner(project.id);
          const fixed = await fixSafeAuditItems(project.id, first.items);
          note = `Safe fixes: ${fixed.done.length} done${fixed.failed.length ? `, not done: ${fixed.failed.join("; ")}` : ""}.\n\n`;
        }
        const res = await auditPlanner(project.id);
        const scope = `${res.checked} posts checked`;
        if (res.items.length === 0) return ok(`${note}${project.label}: all clear (${scope}).`);
        const count = (s: AuditItem["severity"]) => res.items.filter((i) => i.severity === s).length;
        return ok(
          `${note}${project.label}: ${count("fix")} to fix, ${count("check")} to check, ${count("info")} note(s) (${scope}).\n${res.items.map(itemLine).join("\n")}\n\nApply an item with social_audit_fix (project + key). Ask the user before a Remove.`
        );
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "social_audit_fix",
    {
      title: "Apply one Planner audit fix",
      description: `Applies one item from social_audit_planner by its key: Remove (a duplicate that hasn't gone out; only after the user said yes), Move (to the free day shown), Fix (drop a platform that can't take the post) or Remove emoji (from a caption; the words stay). The audit runs again first, so the fix matches the planner as it is now.

Args: project, key (from social_audit_planner).`,
      inputSchema: {
        project: z.string().min(2).max(200),
        key: z.string().min(3).max(200),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const project = await resolveProject(args.project);
        const res = await auditPlanner(project.id);
        const item = res.items.find((i) => i.key === args.key);
        if (!item) return ok(`Nothing to do: "${args.key}" isn't in the audit any more (already fixed, or the planner changed). Run social_audit_planner again.`);
        if (!item.action || item.action.type === "open") return ok(`${item.title}: this one needs a look on the Planner (open the post).`);
        const message = await applyAuditAction(project.id, item.action);
        return ok(`${item.title}: ${message}`);
      } catch (error) {
        return fail(error);
      }
    }
  );
}
