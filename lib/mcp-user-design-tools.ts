import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import sharp from "sharp";
import { db } from "./dashboard/db";
import { fetchObject, uploadObject } from "./storage";
import { kbFileUrl, kbUploadUrl, registerAsset, signUploadToken } from "./kb-files";
import { loadMedia, MAX_IMAGE_BYTES } from "./planner-intake";

/**
 * Group "kb_design" of the restricted user MCP (Shoaib 2026-11-10, first user:
 * Ali Husnain, Tax Solutions By Ali, from ChatGPT). The user designs his own
 * graphics with ChatGPT's image model under OUR rules:
 * - design_brief: one short guide for ChatGPT — the project's design_guide doc
 *   (what is locked, what is free), its brand docs, the design global rules,
 *   and the logo / frame / saved images with links.
 * - brand_finish: the image model can't keep a logo, a real photo, small
 *   numbers or a working QR code exact, so ChatGPT designs only the post area
 *   and this stamps the project's locked "Brand overlay…" PNG (logo + footer,
 *   transparent elsewhere) on top, fitted to the overlay's size.
 * - kb_save_image: saves a picture from the chat (his photo, a reference, a
 *   finished design) into HIS project's knowledge base, only when he asks.
 * - kb_create_upload_link: the same through a browser page, for when the chat
 *   can't pass the file (ChatGPT mobile).
 * Nothing here deletes, edits docs, or reaches another project or the Planner.
 */

export const DESIGN_INSTRUCTIONS =
  "Designing graphics: you work as a senior professional graphic designer for this brand. Before every design call design_brief and follow it exactly. When the project has a brand overlay, you design ONLY the post area and never draw the logo, a footer, contact details or a QR code yourself; then pass your image to brand_finish, which puts the real logo and footer on it exactly, and show the user the finished image it returns. The brand colours and the face of a real person in the user's photo are locked; the background, scene, text, text layout and shapes are yours to design fresh for each post. Every fact in the text comes from the knowledge base. Check the result against the brief's self-check and tell the user. Save an image to the knowledge base only when the user asks (brand_finish with save=true, or kb_save_image); if the chat file can't be passed, give the user a kb_create_upload_link link.";

/** The project's locked overlays (logo + footer, transparent elsewhere): PNG assets titled "Brand overlay…".
 *  A project may have versions (e.g. "with photo" / "no photo"): `choice` picks by words in the title;
 *  otherwise the one titled "(default)", else the newest. */
const OVERLAY_PREFIX = "brand overlay";
async function listOverlays(projectId: string): Promise<{ key: string; title: string }[]> {
  const { data } = await db.from("project_assets").select("title, storage_key, content_type").eq("project_id", projectId).ilike("title", `${OVERLAY_PREFIX}%`).order("created_at", { ascending: false });
  return ((data ?? []) as { title: string; storage_key: string; content_type: string }[]).filter((r) => r.content_type === "image/png").map((r) => ({ key: r.storage_key, title: r.title }));
}
async function findOverlay(projectId: string, choice?: string): Promise<{ key: string; title: string } | null> {
  const all = await listOverlays(projectId);
  if (!all.length) return null;
  if (choice?.trim()) {
    const words = choice.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    const hit = all.find((o) => words.every((w) => o.title.toLowerCase().includes(w)));
    if (!hit) throw new Error(`No overlay matches "${choice}". This project has: ${all.map((o) => o.title).join("; ")}.`);
    return hit;
  }
  return all.find((o) => o.title.toLowerCase().includes("(default)")) ?? all[0];
}

/** Global rules that matter for designing a picture (the rest are about captions, products or planning). */
const DESIGN_GLOBAL_RULES = ["design-glass-light", "layout-alignment", "text-readability", "social-design-default-size", "plain-english"];
/** Project docs for the brief, in this order, after design_guide. */
const BRIEF_DOCS = ["nap", "graphic_rules", "brand_position", "system_rules"];
const PURPOSES = { my_photo: "Photo", reference: "Reference", finished_design: "Design" } as const;
type Purpose = keyof typeof PURPOSES;

const ok = (text: string, structured?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text }], ...(structured ? { structuredContent: structured } : {}) });
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true });

const chatFileSchema = z
  .object({ download_url: z.string().url(), file_id: z.string(), mime_type: z.string().nullish(), file_name: z.string().nullish() })
  .passthrough();
const projectArg = z.string().min(2).max(200).optional().describe("Project name. Leave it out when you have only one project.");
const purposeArg = z
  .enum(["my_photo", "reference", "finished_design"])
  .describe("my_photo = a photo of the user (the face is kept as it is in later designs); reference = a style or layout to follow; finished_design = a design the user is happy with, so later posts stay consistent.");

type Project = { id: string; name: string };

/** One of the user's granted projects: by name, or the only one when no name is given. */
async function myProject(allowed: Set<string>, name?: string): Promise<Project> {
  const ids = [...allowed];
  if (!ids.length) throw new Error("No project has been granted to you yet.");
  const { data } = await db.from("client_projects").select("id, name").in("id", ids);
  const rows = (data ?? []) as Project[];
  if (!name) {
    if (rows.length === 1) return rows[0];
    throw new Error(`Say which project: ${rows.map((r) => r.name).join(", ")}.`);
  }
  const needle = name.toLowerCase().trim();
  const hits = rows.filter((r) => r.name.toLowerCase().includes(needle) || needle.includes(r.name.toLowerCase()));
  if (hits.length !== 1) throw new Error(hits.length ? `"${name}" matches more than one project: ${hits.map((r) => r.name).join(", ")}.` : `No project of yours matches "${name}". Yours: ${rows.map((r) => r.name).join(", ")}.`);
  return hits[0];
}

function savedTitle(purpose: Purpose, title: string): string {
  const prefix = `${PURPOSES[purpose]}: `;
  return (title.startsWith(prefix) ? title : `${prefix}${title}`).slice(0, 200);
}

export function registerUserDesignTools(server: McpServer, user: { email: string; project_ids: string[] }): void {
  const allowed = new Set(user.project_ids);

  server.registerTool(
    "design_brief",
    {
      title: "Design Brief",
      description: `Everything you need before designing a graphic for the project, in one short brief: the project's design guide (what is LOCKED — logo, brand colours, footer strip, a real person's face — and what you design freely), the brand facts, the contact details for the footer, the design rules, and links to the logo, the brand frame and the images saved before (the user's photos, references and finished designs). Call it before every design, and follow it exactly.

Args: project (optional when you have one project).`,
      inputSchema: { project: projectArg },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project: name }: { project?: string }) => {
      try {
        const project = await myProject(allowed, name);
        const [{ data: docs }, { data: rules }, { data: assets }] = await Promise.all([
          db.from("project_knowledge_docs").select("doc_type, slug, title, content").eq("project_id", project.id),
          db.from("kb_global_docs").select("slug, title, content").in("slug", DESIGN_GLOBAL_RULES),
          db.from("project_assets").select("id, kind, title, notes, storage_key, content_type, created_at").eq("project_id", project.id).is("product_id", null).order("created_at", { ascending: false }).limit(60),
        ]);
        const docRows = (docs ?? []) as { doc_type: string; slug: string; title: string; content: string }[];
        const guide = docRows.find((d) => d.doc_type === "design_guide");
        const parts: string[] = [`# Design brief — ${project.name}`];
        parts.push(
          guide
            ? `## ${guide.title}\nThis guide comes first. Where a rule below says something else, this guide wins.\n\n${guide.content}`
            : "## Design guide\nThis project has no design guide yet. Keep the logo, brand colours and footer exactly as the brand docs below say, and ask the user before anything unclear."
        );
        for (const type of BRIEF_DOCS) {
          const d = docRows.find((r) => r.doc_type === type && r.slug === "main");
          if (d) parts.push(`---\n${d.content.startsWith("#") ? d.content : `## ${d.title}\n${d.content}`}`);
        }
        const images = ((assets ?? []) as { id: string; kind: string; title: string; notes: string | null; storage_key: string; content_type: string }[]).filter((a) => a.content_type.startsWith("image/"));
        const line = (a: (typeof images)[number]) => `- ${a.title} (${a.kind}${a.notes ? `; ${a.notes.split("\n")[0].slice(0, 160)}` : ""}): ${kbFileUrl(a.storage_key, a.title)}`;
        const isOverlay = (a: (typeof images)[number]) => a.title.toLowerCase().startsWith(OVERLAY_PREFIX);
        const overlays = images.filter(isOverlay);
        const logos = images.filter((a) => a.kind === "logo");
        const saved = images.filter((a) => a.kind !== "logo" && !isOverlay(a));
        parts.push(
          `---\n## Logo, overlay and saved images\n${
            overlays.length
              ? `**Brand overlay (locked).** brand_finish puts it on top of your design: the logo top-left and the full footer at the bottom. You never draw the logo, a footer, contact details or a QR code yourself, and never copy an overlay into your design. ${overlays.length > 1 ? `Versions (pick one with brand_finish \`overlay\`, e.g. "no photo"; without it the "(default)" one is used):` : "Overlay:"}\n${overlays.map((o) => `- ${o.title} (look at the safe areas only): ${kbFileUrl(o.storage_key, o.title)}`).join("\n")}\n\n`
              : ""
          }Use these files as they are; never redraw the logo. If an image you need is not in this chat yet, give the user its link and ask them to attach it here.\n\n**Logo files**\n${logos.length ? logos.map(line).join("\n") : "- None stored yet. Ask the user to attach the official logo."}\n\n**The user's photos, references and finished designs (newest first)**\n${saved.length ? saved.slice(0, 30).map(line).join("\n") : "- None yet."}`
        );
        const ruleRows = (rules ?? []) as { slug: string; title: string; content: string }[];
        for (const slug of DESIGN_GLOBAL_RULES) {
          const r = ruleRows.find((x) => x.slug === slug);
          if (r) parts.push(`---\n## Design rule: ${r.title}\n${r.content}`);
        }
        return ok(parts.join("\n\n"));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "brand_finish",
    {
      title: "Finish A Design With The Real Logo And Footer",
      description: `Puts the project's locked brand overlay (the real logo top-left and the full footer: photo, name, credential, call to action, QR code and contact strip) on top of your design, exactly, and returns the finished post. Use it on every design for a project that has a brand overlay; never draw those parts yourself.

Your design: \`file\` = the image you made in this chat (ChatGPT passes it here), or \`url\` = a public https link to it. It is fitted to 1080 × 1350 (4:5): a taller image (like 1024 × 1536) loses its bottom part, which the footer covers anyway. Keep the design brief's safe areas clear.

Args: project (optional), overlay (optional: which footer version when the project has more than one, e.g. "no photo" or "with photo"; default = the "(default)" one), title (short, e.g. "IAS 1 vs IFRS 18"), save (true only when the user asked to keep it in the knowledge base).
Returns the finished image and a link to download it.`,
      inputSchema: {
        project: projectArg,
        file: chatFileSchema.optional(),
        url: z.string().url().max(2000).optional(),
        overlay: z.string().min(2).max(80).optional(),
        title: z.string().min(1).max(150).optional(),
        save: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { "openai/fileParams": ["file"] },
    },
    async (args: { project?: string; file?: z.infer<typeof chatFileSchema>; url?: string; overlay?: string; title?: string; save?: boolean }) => {
      try {
        const project = await myProject(allowed, args.project);
        const overlay = await findOverlay(project.id, args.overlay);
        if (!overlay) throw new Error("This project has no brand overlay yet, so there is nothing to put on. Ask Shoaib to add one.");
        const media = await loadMedia({ file: args.file, url: args.url });
        if (media.video) throw new Error("Only pictures can be finished here (JPG, PNG or WebP).");

        const layer = (await fetchObject(overlay.key)).buffer;
        const { width: W = 1080, height: H = 1350 } = await sharp(layer).metadata();
        const src = await sharp(media.buffer).rotate().metadata();
        const srcRatio = (src.width ?? W) / (src.height ?? H);
        // Cropped from the bottom: that is where the footer goes anyway.
        const base = await sharp(media.buffer).rotate().resize(W, H, { fit: "cover", position: "top" }).toBuffer();
        const finished = await sharp(base).composite([{ input: layer }]).png().toBuffer();

        const title = (args.title?.trim() || `Post ${new Date().toISOString().slice(0, 10)}`).slice(0, 140);
        const key = `knowledge/${project.id}/finished/${randomUUID()}.png`;
        await uploadObject(key, finished, "image/png");
        const link = kbFileUrl(key, title);
        let saved = "";
        if (args.save) {
          const asset = await registerAsset({ projectId: project.id, kind: "reference_image", title: savedTitle("finished_design", title), key, contentType: "image/png", notes: `Finished with brand_finish by ${user.email}, ${new Date().toISOString().slice(0, 10)}.` });
          saved = ` Saved to the knowledge base as "${savedTitle("finished_design", title)}" (asset ${asset.id}).`;
        }
        const cropNote = Math.abs(srcRatio - W / H) > 0.02 ? ` Your image (${src.width} × ${src.height}) was fitted to ${W} × ${H}, so its bottom part was cut.` : "";
        const preview = await sharp(finished).jpeg({ quality: 85 }).toBuffer();
        return {
          content: [
            { type: "image" as const, data: preview.toString("base64"), mimeType: "image/jpeg" },
            { type: "text" as const, text: `Finished: "${title}" for ${project.name}, ${W} × ${H}, with the real logo and footer (${overlay.title}).${cropNote}${saved}\nDownload (PNG): ${link}\nShow the user this link and the image. If any of your text sits under the footer or the logo, move it into the safe area and run brand_finish again.` },
          ],
          structuredContent: { url: link, width: W, height: H, saved: Boolean(args.save) },
        };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_save_image",
    {
      title: "Save An Image To My Knowledge Base",
      description: `Saves one picture into the project's knowledge base, so later designs can use it and stay consistent: a photo of the user, a reference, or a finished design. Only when the user asks to save it.

The picture: \`file\` = an image the user sent or you made in this chat (ChatGPT passes it here), or \`url\` = a public https link to it (a Google Drive file link works). JPG, PNG or WebP, up to 25 MB. If the file can't be passed, use kb_create_upload_link.

Args: purpose (my_photo | reference | finished_design), title (short, e.g. "Budget 2026 post"), notes (optional: what to keep from it), project (optional).`,
      inputSchema: {
        project: projectArg,
        file: chatFileSchema.optional(),
        url: z.string().url().max(2000).optional(),
        purpose: purposeArg,
        title: z.string().min(1).max(150),
        notes: z.string().max(1500).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      _meta: { "openai/fileParams": ["file"] },
    },
    async (args: { project?: string; file?: z.infer<typeof chatFileSchema>; url?: string; purpose: Purpose; title: string; notes?: string }) => {
      try {
        const project = await myProject(allowed, args.project);
        const media = await loadMedia({ file: args.file, url: args.url });
        if (media.video) throw new Error("Only pictures can be saved here (JPG, PNG or WebP).");
        if (media.buffer.length > MAX_IMAGE_BYTES) throw new Error("The picture is over 25 MB.");
        const title = savedTitle(args.purpose, args.title);
        const key = `knowledge/${project.id}/assets/${randomUUID()}.${media.ext}`;
        await uploadObject(key, media.buffer, media.mime);
        const stamp = new Date().toISOString().slice(0, 10);
        const notes = [args.notes?.trim(), `Saved by ${user.email} from the chat, ${stamp}.`].filter(Boolean).join("\n");
        const asset = await registerAsset({ projectId: project.id, kind: "reference_image", title, key, contentType: media.mime, notes });
        return ok(`Saved to ${project.name}: "${title}" (${Math.round(media.buffer.length / 1024)} KB). It now shows in design_brief.\nLink: ${asset.url}`, { asset_id: asset.id, url: asset.url });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_create_upload_link",
    {
      title: "Get A Link To Upload Images",
      description: `When a picture can't be passed to kb_save_image (for example on the phone app), this gives a link that works for one hour. The user opens it in a browser and picks the picture(s); they are saved to the project's knowledge base.

Args: purpose (my_photo | reference | finished_design), title, notes (optional), project (optional).`,
      inputSchema: { project: projectArg, purpose: purposeArg, title: z.string().min(1).max(150), notes: z.string().max(1500).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args: { project?: string; purpose: Purpose; title: string; notes?: string }) => {
      try {
        const project = await myProject(allowed, args.project);
        const notes = [args.notes?.trim(), `Uploaded by ${user.email} through a link.`].filter(Boolean).join("\n");
        const url = kbUploadUrl(signUploadToken({ p: project.id, k: "reference_image", pr: null, t: savedTitle(args.purpose, args.title), n: notes, m: false }));
        return ok(`Upload link for ${project.name}, valid for 1 hour:\n${url}\n\nOpen it, choose the picture(s), and they are saved. Then call design_brief to see them.`, { url });
      } catch (error) {
        return fail(error);
      }
    }
  );
}
