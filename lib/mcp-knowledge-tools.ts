import "server-only";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import sharp from "sharp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "./dashboard/db";
import { fetchObject, uploadObject, deleteObject, presignUpload } from "./storage";
import { kbDirectFinishUrl, kbFileUrl, kbUploadUrl, registerAsset, signDirectUploadToken, signUploadToken, sniff } from "./kb-files";
import { CDN_REPO, cdnUrlMap, publishToCdn, slugifyName } from "./kb-cdn";
import { registerContentTools } from "./mcp-content-tools";

/**
 * Per-project knowledge base — brand docs (NAP, positioning, ICP, pain points,
 * graphic rules, marketing docs, memory…), exact product literature, product
 * photos/reference images, plus cross-brand global rules. Deliberately NOT in
 * the dashboard UI (Shoaib: "beshak kahen nazar na aye lakin mcp mai zaror
 * reflect ho") but fully READ + WRITE through MCP, so it can be maintained
 * from Claude web as well. Only Supabase-schema/Vercel work stays in the repo.
 *
 * Shared by the local stdio server (mcp/tools/knowledge.ts, allowLocalFiles)
 * and the remote OAuth server (app/api/mcp/route.ts, no local files — the
 * serverless filesystem must never be readable through a tool argument).
 */

export const KB_SERVER_INSTRUCTIONS = [
  "Knowledge base tools (kb_*): before writing captions, ad copy, creatives or image-generation prompts for a client project, call kb_get_brief with the project name — it returns global rules, the project's brand docs and the product list. For any product claim (composition, dosage, indications) call kb_get_product and quote it verbatim; never approximate.",
  "Plain English by default for EVERY project (global rule `plain-english`): short sentences, everyday words a Pakistani reader knows, trade terms/product names/doses kept exact, meaning never changed. Only a project whose docs say english_level: advanced or native gets more complex English.",
  "Design for EVERY project is light and clean, never dark, and has NO glass effect (global rule `design-glass-light`, 2026-10-09): no dark backgrounds/panels/overlays, no frosted/glass cards, transparent shades or blur behind text — text sits straight on the photo, in a calm, light, empty area generated into the scene, and must pass the global rule `text-readability` (size floor, contrast check); brand colours as accents, the design drawn from the post's topic. Educational posts teach (global rule `educational-posts`) — the product is optional. Each post prompt also carries one presentation idea (global rule `presentation-ideas`: frames, shapes, backgrounds) to blend into its style.",
  "Layout for EVERY project (global rule `layout-alignment`): think first (audience, one purpose, one clear message, a REAL psychology trigger — never invented reviews or ratings), rule-of-thirds composition, one shared left edge (or one centre line), equal cards, no empty cards, headline at most 2 lines, every element earns its place, a wide wordmark logo about 30% of the width. Self-check every generated image against that rule's list (score 0–100, pass 70+ with every word correct); if it fails, make it again once with \"fix only: …\" and show the better one.",
  "NAP (name/address/phone/email) always comes from the brand's official website (the project's `nap` doc), never from product PDFs, labels or old posts, and is never part of branding docs.",
  "CLAUDE WEB WIDGETS/ARTIFACTS: the sandbox blocks every image origin except a few CDNs — only the `Widget-safe (jsDelivr)` / cdn_url links load there; adsbyshoaib.com URLs show as broken images. If a file has no widget-safe URL yet, ask the user before calling kb_publish_to_cdn (it publishes to a PUBLIC repo).",
  "Images: every stored file has a permanent public URL (returned by kb_get_product / kb_list_assets / kb_get_asset) you can use in <img> or SVG <image href>; add &w=800&fmt=jpg to get a smaller rendition. Adding files: if you can run shell commands and the files are on that machine, use kb_create_direct_upload (curl, no browser, many files at once); with a public https link use kb_add_asset sourceUrl; a file that only exists in the chat needs kb_create_upload_link for the user to open. kb_update_asset fixes a file's title/notes/order/product or makes it the main photo.",
  "Google Business Profile (gbp_* tools): Google-friendly pace, always — never reply to reviews or post in bulk. One write at a time, at least 5 minutes apart, max 20 per location per 24 hours (the server enforces it). For many reviews: draft all for the user, publish one, and say when the next can go.",
  "Social posts by calendar day (\"Day 1 ki post design karo\"): call kb_get_social_post — it returns the locked image prompt, the caption and the original images to attach. Use them unchanged.",
  "Product posts (one social post per product, presented like a brochure page — \"Aminotox ki brief post design karo\"): call kb_get_product_post. Same rules: use the prompt, caption and images unchanged.",
  "Caution / disclaimer lines (e.g. \"Vet — Not for human use. Veterinary use only.\") go ONLY on product-related posts and captions — a post that shows a product or is about a named product. Never on any other post (brand, general tips, distributor/B2B, Jummah, events, greetings…), in every project.",
  "Never write the word \"dealer\" (or \"dealers\", \"dealership\") in any post, caption, headline or copy, for any project (Shoaib, 2026-10-05) — always \"distributor\" / \"distributors\", and \"Become a Distributor\" for recruitment posts (global rule `no-dealer-word`).",
  "Content is OURS for every project (Shoaib, 2026-10-03): every word on a post and its caption is written in the knowledge base and approved by the user before design. Design tools (image models, ChatGPT while designing) never write, add, shorten or rewrite words; if a post has no approved words, stop, draft them for approval, save them, then design.",
  "Occasion words: kb_list_occasion_copy shows what is approved / pending per project; kb_save_occasion_copy saves drafts in the right format; kb_approve_occasion_copy approves them — only after the user says so. Jummah gets a new verified verse, hadith or dua and a new Islamic layout every Friday. Each project's full design system is its DESIGN.md (KB doc design_system/main), shown in kb_get_brief.",
  "Jummah / Friday and occasion posts for any project (\"Jumma post banao\", Eid, Ramadan, 14 August, 23 March, Kashmir day…): call kb_get_occasion_post — brand items stay fixed, the background and words are made for the day (Arabic/Urdu only from its verified texts), never a product or call to action. Need a new ayah? Find it with quran_search / quran_get_ayah (Quran Cloud, exact Tanzil text) and save it with kb_add_verified_ayah — never type Arabic yourself.",
  "Icons: never hand-draw icon paths. Find a correct SVG with icon_search and fetch it with icon_get_svg (Iconify, 200+ open sets; brand logos such as WhatsApp are in simple-icons).",
  "Event posts (expo stall, seminar, distributor meet, product launch, new partner, anniversary…): follow the global rule `event-posts` — only real facts from the user/client (ask for name, date, venue, stall, photos; never invent), up to 4 posts per event (announcement, reminder, live, thank-you). A project's dated posts (Jummah, Islamic/national/international days, events) are listed in its marketing doc `dated-posts-plan` when it has one.",
  "The kb_* write tools (kb_upsert_doc, kb_upsert_product, kb_add_asset, kb_add_memory, kb_upsert_global_rule…) let you maintain the knowledge base; deletes need confirm=true.",
].join("\n");

const MAX_DOC_CHARS = 60_000;
const MAX_BASE64_BYTES = 3_300_000; // Vercel request bodies are ~4.5 MB including base64 overhead
const MAX_FETCH_BYTES = 12_000_000;

const DOC_ORDER = ["nap", "brand_position", "icp", "pain_points", "graphic_rules", "system_rules"];
/** Types shown in full inside kb_get_brief; others (marketing_doc…) are listed and fetched on demand. */
const INLINE_TYPES = new Set([...DOC_ORDER, "design_system", "memory"]);

const docTypeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, "lowercase letters/digits/underscore, e.g. brand_position, marketing_doc, memory");
const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/, "lowercase letters/digits/hyphen");
const ASSET_KINDS = ["product_image", "reference_image", "logo", "document", "presentation_page", "other"] as const;
/** Direct uploads also take brochure literature (page images + the PDF). */
const DIRECT_KINDS = [...ASSET_KINDS, "literature_page", "literature_pdf"] as const;
const DIRECT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };
const DIRECT_TTL_SECONDS = 30 * 60;
const confirmSchema = z.boolean().optional();
/** Some MCP clients send numbers as strings ("3"); accept both. */
const intLike = z.union([z.number().int(), z.string().regex(/^-?\d+$/).transform(Number)]);

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: formatError(error) }], isError: true as const });
const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
});
const needConfirm = (what: string) =>
  ok(`Not deleted. This permanently removes ${what}. Call again with confirm=true to proceed.`);

type ProjectRow = { id: string; name: string; client_id: string; clients: { name: string } | { name: string }[] | null };
const projectLabel = (p: ProjectRow) =>
  `${(Array.isArray(p.clients) ? p.clients[0]?.name : p.clients?.name) ?? "Unknown"} — ${p.name}`;

/** Fuzzy-matches a project by its own name or "Client — Project" label —
 *  same convention as the social MCP tools. */
async function findProject(name: string): Promise<{ id: string; label: string; name: string }> {
  const { data } = await db.from("client_projects").select("id, name, client_id, clients(name)");
  const rows = (data ?? []) as ProjectRow[];
  const needle = name.toLowerCase();
  const matches = rows.filter((p) => p.name.toLowerCase().includes(needle) || projectLabel(p).toLowerCase().includes(needle));
  if (matches.length === 0) throw new Error(`No project matches "${name}". Projects are created on the dashboard's Clients page.`);
  if (matches.length > 1) throw new Error(`"${name}" matches multiple projects: ${matches.map(projectLabel).join(", ")}. Be more specific.`);
  return { id: matches[0].id, label: projectLabel(matches[0]), name: matches[0].name };
}

type ProductRow = { id: string; name: string; slug: string; category: string | null; content: string; image_key: string | null };

async function findProduct(projectId: string, productName: string): Promise<ProductRow> {
  const { data } = await db.from("project_products").select("id, name, slug, category, content, image_key").eq("project_id", projectId);
  const rows = (data ?? []) as ProductRow[];
  const needle = productName.toLowerCase();
  const exact = rows.filter((r) => r.slug === needle || r.name.toLowerCase() === needle);
  const matches = exact.length ? exact : rows.filter((r) => r.name.toLowerCase().includes(needle) || r.slug.includes(needle));
  if (matches.length === 0) throw new Error(`No product matches "${productName}".`);
  if (matches.length > 1) throw new Error(`"${productName}" matches multiple products: ${matches.map((r) => r.name).join(", ")}. Be more specific.`);
  return matches[0];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";

// ── file intake (base64 / public URL / local path on stdio only) ─────────

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:") && net.isIPv4(lower.slice(7))) return isPrivateIp(lower.slice(7));
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

/** https-only fetch that refuses private/loopback hosts (also after redirects). */
async function fetchPublicUrl(rawUrl: string): Promise<Buffer> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host)) {
      if (isPrivateIp(host)) throw new Error("That URL points to a private address.");
    } else {
      const addrs = await dns.lookup(host, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That URL's host is not publicly reachable.");
    }
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "adsbyshoaib-knowledge-base/1.0" } });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new Error(`Could not download the file: HTTP ${res.status}.`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_FETCH_BYTES) throw new Error("File is larger than 12 MB.");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FETCH_BYTES) throw new Error("File is larger than 12 MB.");
    return buf;
  }
  throw new Error("Too many redirects.");
}

type FileSource = { dataBase64?: string; sourceUrl?: string; filePath?: string };

async function loadFile(src: FileSource, allowLocalFiles: boolean): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const provided = [src.dataBase64, src.sourceUrl, src.filePath].filter(Boolean).length;
  if (provided !== 1) throw new Error(`Provide exactly one of dataBase64, sourceUrl${allowLocalFiles ? ", filePath" : ""}.`);
  let buffer: Buffer;
  if (src.dataBase64) {
    const raw = src.dataBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
    if (raw.length > MAX_BASE64_BYTES * 1.4) throw new Error("dataBase64 is too large (~3 MB max) — use sourceUrl for bigger files.");
    buffer = Buffer.from(raw, "base64");
  } else if (src.sourceUrl) {
    buffer = await fetchPublicUrl(src.sourceUrl);
  } else {
    if (!allowLocalFiles) throw new Error("filePath is only available on the local MCP server.");
    buffer = await readFile(src.filePath!);
    if (buffer.length > MAX_FETCH_BYTES) throw new Error("File is larger than 12 MB.");
    if (!sniff(buffer) && extname(src.filePath!)) throw new Error(`Unsupported file "${extname(src.filePath!)}" — images (png/jpg/webp/gif) or PDF only.`);
  }
  const type = sniff(buffer);
  if (!type) throw new Error("Unsupported or corrupt file — images (png/jpg/webp/gif) or PDF only.");
  return { buffer, ...type };
}

// ── content blocks ────────────────────────────────────────────────

type Block = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

/** Fetches a stored image; oversized ones are downscaled so responses stay light. */
async function imageBlock(key: string): Promise<Block> {
  const { buffer, contentType } = await fetchObject(key);
  if (buffer.length > 600_000) {
    const jpeg = await sharp(buffer).flatten({ background: "#ffffff" }).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    return { type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" };
  }
  return { type: "image", data: buffer.toString("base64"), mimeType: contentType };
}

type AssetRow = { id: string; project_id: string; product_id: string | null; kind: string; title: string; storage_key: string; content_type: string; notes: string | null; sort: number };

async function assetBlocks(a: AssetRow, cdn?: Map<string, string>): Promise<Block[]> {
  const url = kbFileUrl(a.storage_key, a.title);
  const widget = cdn?.get(a.storage_key) ? `\nWidget-safe (jsDelivr): ${cdn.get(a.storage_key)}` : "";
  if (a.content_type.startsWith("image/")) {
    try {
      return [{ type: "text", text: `${a.title} (${a.kind})${a.notes ? ` — ${a.notes}` : ""}\nURL: ${url}${widget}` }, await imageBlock(a.storage_key)];
    } catch {
      return [{ type: "text", text: `${a.title}: image missing from storage.` }];
    }
  }
  return [{ type: "text", text: `${a.title} (${a.kind}) — PDF/file URL: ${url}${widget}` }];
}

/** The ```json block of a marketing doc (content calendar, design lock, product brief posts). */
function jsonBlock(text: string, what: string): unknown {
  const m = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`The ${what} doc has no \`\`\`json block.`);
  return JSON.parse(m[1]);
}


/** Occasion key from a key, a name or a common spelling ("eid milad" → milad, not eid). */
const OCCASION_ALIASES: Record<string, string[]> = {
  jummah: ["juma", "jumma", "jumah", "jumuah", "friday", "jummamubarak", "jummahmubarak", "blessedfriday"],
  ramadan: ["ramzan", "ramadhan", "ramadankareem", "ramzanmubarak"],
  laylat_al_qadr: ["laylatulqadr", "lailatulqadr", "shabeqadr", "shabqadr", "nightofpower", "27ramadan"],
  eid_ul_fitr: ["eid", "eidulfitr", "eidalfitr", "chotieid", "eidmubarak"],
  eid_ul_adha: ["eidaladha", "eiduladha", "bakraeid", "bakrid", "eidqurban"],
  islamic_new_year: ["muharram", "hijrinewyear", "newislamicyear", "1muharram"],
  ashura: ["ashur", "youmeashur", "10muharram"],
  eid_milad_un_nabi: ["milad", "miladunnabi", "12rabiulawwal", "rabiulawwal", "mawlid"],
  shab_e_barat: ["shabebarat", "shabbarat", "15shaban"],
  kashmir_day: ["kashmir", "kashmirsolidarityday", "5february", "5feb", "yomeykjehtikashmir"],
  pakistan_day: ["23march", "pakistanresolutionday", "yomepakistan"],
  independence_day: ["14august", "independence", "jashneazadi", "azadi", "yomeazadi"],
  defence_day: ["6september", "defenseday", "yomedifa"],
  iqbal_day: ["9november", "iqbal", "allamaiqbal"],
  quaid_day: ["25december", "quaid", "quaideazam", "jinnahday"],
  world_veterinary_day: ["veterinaryday", "vetday", "worldvetday"],
  world_egg_day: ["eggday", "worldeggday"],
  world_animal_day: ["animalday", "worldanimalday", "4october"],
  world_food_day: ["foodday", "worldfoodday", "16october"],
  antimicrobial_awareness_week: ["waaw", "amrweek", "amrawareness", "antimicrobial", "antibioticawareness", "antibioticweek"],
  world_zoonoses_day: ["zoonoses", "zoonosis", "6july"],
  world_milk_day: ["milkday", "worldmilkday", "1june"],
  world_food_safety_day: ["foodsafety", "7june"],
};

function resolveOccasionKey(occasions: Record<string, { names: Record<string, string> }>, occasion: string): string | null {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const want = norm(occasion);
  // Partial matches: the longest alias wins.
  const partial = Object.entries(OCCASION_ALIASES)
    .flatMap(([k, list]) => list.filter((a) => want.includes(a)).map((a) => ({ k, len: a.length })))
    .sort((a, b) => b.len - a.len)[0]?.k;
  return (
    Object.keys(occasions).find((k) => norm(k) === want) ??
    Object.entries(occasions).find(([, o]) => Object.values(o.names).some((n) => norm(n) === want))?.[0] ??
    Object.entries(OCCASION_ALIASES).find(([, list]) => list.includes(want))?.[0] ??
    partial ??
    null
  );
}

type OccasionCopyVariant = { approved?: boolean; approved_by?: string; date?: string; language?: string; text_id?: string; text_on_image: Record<string, string>; caption?: string };

/** The project's `occasion-copy` doc (approved words for Jummah and dated posts). */
async function readOccasionCopy(projectId: string): Promise<{ title: string; intro: string; copy: Record<string, OccasionCopyVariant[]> } | null> {
  const { data } = await db.from("project_knowledge_docs").select("title, content").eq("project_id", projectId).eq("slug", "occasion-copy").maybeSingle();
  if (!data) return null;
  const row = data as { title: string; content: string };
  const m = row.content.match(/```json\s*\n([\s\S]*?)\n```/);
  return { title: row.title, intro: m ? row.content.slice(0, m.index).trimEnd() : row.content.trimEnd(), copy: m ? (JSON.parse(m[1]) as Record<string, OccasionCopyVariant[]>) : {} };
}

async function writeOccasionCopy(projectId: string, title: string, intro: string, copy: Record<string, OccasionCopyVariant[]>): Promise<void> {
  const content = `${intro}\n\n\`\`\`json\n${JSON.stringify(copy, null, 2)}\n\`\`\``;
  const { error } = await db
    .from("project_knowledge_docs")
    .upsert({ project_id: projectId, doc_type: "marketing_doc", slug: "occasion-copy", title, content, updated_at: new Date().toISOString() }, { onConflict: "project_id,doc_type,slug" });
  if (error) throw new Error(error.message);
}

async function occasionKeys(): Promise<Record<string, { names: Record<string, string> }>> {
  const { data } = await db.from("kb_global_docs").select("content").eq("slug", "occasion-posts").maybeSingle();
  if (!data) return {};
  return (jsonBlock((data as { content: string }).content, "occasion-posts") as { occasions: Record<string, { names: Record<string, string> }> }).occasions;
}

const VET_CAPTION_LINE = /^\s*vet\s*[—–-]\s*not for human.*$\n?/gim;

/** The global design rules ride inside every post prompt for every project — with
 *  or without its own design lock, today's projects and future ones (Shoaib,
 *  2026-10-03: "sb projects ka mtlb hai global rule jitny projects hon gy sab"):
 *  `design-glass-light` (light, never dark, no glass effect since 2026-10-09) and `layout-alignment`
 *  (grid, logo size, self-check). */
async function globalRule(slug: string): Promise<string | null> {
  const { data } = await db.from("kb_global_docs").select("content").eq("slug", slug).maybeSingle();
  return (data as { content: string } | null)?.content ?? null;
}

/** How many blocks / rows / chips the post has, read from its own text — so the
 *  image model draws exactly that many, aligned, and never an empty extra card
 *  (Shoaib, 2026-10-03: "Content alignment dekho zara aur content presentation"). */
function layoutPlan(text: unknown): string[] {
  if (!text || typeof text !== "object") return [];
  const plan = ["One shared left edge for every text block and the logo (or, in a centred layout, one centre line for all of them)."];
  for (const [k, v] of Object.entries(text as Record<string, unknown>)) {
    const name = k.replace(/_/g, " ");
    if (typeof v === "string") plan.push(k === "headline" ? "headline: the largest text, at most 2 lines, broken at a natural phrase." : `${name}: one block.`);
    else if (Array.isArray(v) && /chip/i.test(k)) plan.push(`${name}: exactly ${v.length} — in ONE clean row of text with icons and thin dividers (no glass bar, no pills); each as wide as its own text, all the same height; a long one stays on 1–2 lines; no extra or empty chip.`);
    else if (Array.isArray(v)) plan.push(`${name}: exactly ${v.length} item${v.length === 1 ? "" : "s"} — ${v.length} row${v.length === 1 ? "" : "s"} / card${v.length === 1 ? "" : "s"} in the same style and font size, equal gaps, aligned; no extra or empty card.`);
    else if (v && typeof v === "object") plan.push(`${name}: one group of ${Object.keys(v).length} parts, aligned together.`);
  }
  return plan;
}

type PresentationPattern = { key: string; name: string; best_for: string[]; structure: string; shapes?: string; note?: string };

/** The post's content type in the words the `presentation-ideas` library uses. */
function contentType(entry: Record<string, unknown>): string {
  const p = String(entry.pillar ?? "").toLowerCase();
  if (!p) return entry.product ? "product brief" : "brand awareness";
  for (const t of ["carousel", "brand", "spotlight", "education", "tip", "range", "distributor"]) {
    if (p.includes(t)) return { brand: "brand awareness", spotlight: "product spotlight" }[t] ?? t;
  }
  return p;
}

/** One presentation idea per post from the global `presentation-ideas` library
 *  (Shoaib, 2026-10-03: shapes, frames and backgrounds for inspiration — not
 *  content), matched to the content type. The whole series (calendar or product
 *  posts) is walked in order, each post starting one step further round the
 *  library and never taking the previous post's idea, so posts in a row look
 *  different. */
async function presentationIdea(entry: Record<string, unknown>, series: Record<string, unknown>[] = [entry]): Promise<Record<string, unknown> | null> {
  const rule = await globalRule("presentation-ideas");
  if (!rule) return null;
  let patterns: PresentationPattern[];
  try {
    patterns = (jsonBlock(rule, "presentation-ideas") as { patterns: PresentationPattern[] }).patterns;
  } catch {
    return null;
  }
  const ring = patterns.filter((p) => !p.best_for.includes("carousel"));
  if (!ring.length) return null;
  const at = series.indexOf(entry);
  let pick: PresentationPattern | undefined;
  for (const [i, e] of (at >= 0 ? series.slice(0, at + 1) : [entry]).entries()) {
    const type = contentType(e);
    const carousel = type === "carousel" ? patterns.find((p) => p.best_for.includes("carousel")) : undefined;
    const order = ring.map((_, j) => ring[(i + j) % ring.length]);
    const fits = order.filter((p) => p.best_for.includes(type));
    const pool = fits.length ? fits : order;
    pick = carousel ?? pool.find((p) => p.key !== pick?.key) ?? pool[0];
  }
  if (!pick) return null;
  const type = contentType(entry);
  return {
    how_to_use: "Inspiration for HOW to present this post (frames, shapes, list treatment, background) — blend it into this post's style. The locked items, the lock's do_not, design_rule_every_project and layout_rule_every_project win. It never adds words: any question, tag, pill or label it mentions uses only words from text_on_image. Never copy another brand's words or exact layout; dark bands, glass bars or frosted cards in the idea become text straight on a calm, light area of the photo (no glass effect).",
    content_type: type,
    idea: pick.name,
    structure: pick.structure,
    ...(pick.shapes ? { shapes: pick.shapes } : {}),
    ...(pick.note ? { note: pick.note } : {}),
  };
}

const SELF_CHECK = "Self-check the finished image against the global rule `layout-alignment` (score 0–100: exact words, logo, product, alignment, light and no glass effect, text readable on a phone, footer and caution line, nothing cramped, one clear message, hero on the grid, every element earns its place). Pass = 70+ with every word correct; otherwise make it again ONCE with \"Keep everything that was right; fix only: …\" and show the better one, with its score.";

/** Product-related = names a product, attaches a product photo, or its image text
 *  mentions one of the project's products. Only these carry the vet/caution line. */
function isProductRelated(entry: Record<string, unknown>, productNames: string[]): boolean {
  if (entry.product || Object.keys((entry.attach ?? {}) as object).some((k) => /product/i.test(k))) return true;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const text = squash(JSON.stringify(entry.text_on_image ?? ""));
  return productNames.map(squash).some((n) => n.length >= 4 && text.includes(n));
}

/** A social-post brief (calendar day or product post) merged with the design lock:
 *  the image prompt, the caption and the original images to attach.
 *  The vet line belongs on product-related posts only (Shoaib, 2026-10-02). */
async function designBriefBlocks(heading: string, brief: string, lock: unknown, entry: Record<string, unknown>, fileTag: string, productNames: string[] = [], series: Record<string, unknown>[] = [entry]): Promise<Block[]> {
  const rest = { ...entry };
  const isProduct = isProductRelated(entry, productNames);
  let caption = rest.caption_for_posting as string | undefined;
  if (!isProduct && caption) caption = caption.replace(VET_CAPTION_LINE, "").trimEnd();
  delete rest.caption_for_posting;
  delete rest.source_check;
  const globalLock =
    !isProduct && lock && typeof lock === "object" && "vet_line" in lock
      ? { ...lock, vet_line: "NONE on this post — it is not about a product. Do not add \"Vet — Not for human use. Veterinary use only.\" or any other caution/disclaimer line." }
      : lock;
  const prompt = {
    brief,
    design_rule_every_project: await globalRule("design-glass-light"),
    layout_rule_every_project: await globalRule("layout-alignment"),
    layout_plan: layoutPlan(rest.text_on_image),
    presentation_idea_this_time: await presentationIdea(entry, series),
    global_design_lock: globalLock,
    ...rest,
  };

  // Resolve the attachments (CDN URLs in the doc) back to stored originals.
  const attach = (rest.attach ?? {}) as Record<string, string | string[]>;
  const urls = Object.values(attach).flatMap((v) => (Array.isArray(v) ? v : [v])).filter(Boolean);
  const { data: cdnRows } = await db.from("kb_cdn_files").select("storage_key, cdn_url").in("cdn_url", urls.length ? urls : ["-"]);
  const byUrl = new Map(((cdnRows ?? []) as { storage_key: string; cdn_url: string }[]).map((r) => [r.cdn_url, r.storage_key]));
  const many = urls.length > 3;
  const content: Block[] = [
    {
      type: "text",
      text: `${heading}\n\nSTEP 1. Attach these ${urls.length} image(s), in this order (download the full-resolution original if your image tool needs a file):\n${urls
        .map((u, i) => {
          const key = byUrl.get(u);
          return `${i + 1}. ${u}${key ? `\n   Full resolution: ${kbFileUrl(key, `${fileTag}-image-${i + 1}`)}` : ""}`;
        })
        .join("\n")}\n\nSTEP 2. Generate the image with this prompt, unchanged:\n\n\`\`\`json\n${JSON.stringify(prompt, null, 2)}\n\`\`\`\n\nSTEP 3. Check the result against the lock (product identical to the attached photo, exact text only, brand colours only, full-width footer strip, ${isProduct ? "vet line" : "NO vet line"}) and the layout_plan. ${SELF_CHECK}\n\nCAPTION TO POST (give this to the user as-is):\n\n${caption ?? "(no caption in the doc)"}`,
    },
  ];
  for (const [i, u] of urls.entries()) {
    const key = byUrl.get(u);
    if (!key) continue;
    try {
      if (many) {
        const { buffer } = await fetchObject(key);
        const small = await sharp(buffer).flatten({ background: "#ffffff" }).resize({ width: 360, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        content.push({ type: "text", text: `Image ${i + 1} (preview — use the full-resolution link to attach):` }, { type: "image", data: small.toString("base64"), mimeType: "image/jpeg" });
      } else {
        content.push({ type: "text", text: `Image ${i + 1}${i === 0 ? " (logo)" : " (approved product photo — locked, do not alter)"}:` }, await imageBlock(key));
      }
    } catch {
      content.push({ type: "text", text: `Image ${i + 1}: missing from storage — use the URL above.` });
    }
  }
  return content;
}

async function safeDelete(key: string | null | undefined) {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch {
    // Best-effort cleanup: an orphaned object costs nothing next to failing the whole call.
  }
}

const orderDocs = <T extends { doc_type: string; slug: string }>(docs: T[]) =>
  [...docs].sort((a, b) => {
    const ia = DOC_ORDER.indexOf(a.doc_type);
    const ib = DOC_ORDER.indexOf(b.doc_type);
    const wa = ia === -1 ? (a.doc_type === "memory" ? 1000 : 500) : ia;
    const wb = ib === -1 ? (b.doc_type === "memory" ? 1000 : 500) : ib;
    return wa - wb || a.doc_type.localeCompare(b.doc_type) || a.slug.localeCompare(b.slug);
  });

function mergeContent(existing: string | undefined, incoming: string, mode: "replace" | "append"): string {
  const merged = mode === "append" && existing ? `${existing.trimEnd()}\n\n${incoming.trim()}` : incoming;
  if (merged.length > MAX_DOC_CHARS) throw new Error(`Content is too long (${merged.length} > ${MAX_DOC_CHARS} chars).`);
  return merged;
}

export function registerKnowledgeTools(server: McpServer, opts: { allowLocalFiles?: boolean } = {}): void {
  const allowLocalFiles = opts.allowLocalFiles === true;
  // Quran Cloud + Iconify (quran_get_ayah, quran_search, kb_add_verified_ayah, icon_search, icon_get_svg)
  registerContentTools(server);
  const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
  const fileArgs = {
    dataBase64: z.string().optional().describe("File bytes, base64 (≤ ~3 MB). Prefer sourceUrl for larger files."),
    sourceUrl: z.string().url().optional().describe("Public https:// URL the server downloads the file from (≤ 12 MB)."),
    ...(allowLocalFiles ? { filePath: z.string().optional().describe("Absolute local file path (local MCP server only).") } : {}),
  };

  // ── read ──────────────────────────────────────────────────────

  server.registerTool(
    "kb_list_projects",
    {
      title: "List Projects And Knowledge Base Coverage",
      description: `Lists every client project with how much knowledge-base content it has (docs, products, assets). Projects with 0 everywhere have no knowledge base yet — start one with kb_upsert_doc / kb_upsert_product. (Projects themselves are created on the dashboard's Clients page.)

Returns (JSON): { projects: [{ project_label, docs, products, assets }], global_rules }`,
      inputSchema: {},
      annotations: READ,
    },
    async () => {
      try {
        const [{ data: projects }, { data: docs }, { data: products }, { data: assets }, { data: globals }] = await Promise.all([
          db.from("client_projects").select("id, name, client_id, clients(name)"),
          db.from("project_knowledge_docs").select("project_id"),
          db.from("project_products").select("project_id"),
          db.from("project_assets").select("project_id"),
          db.from("kb_global_docs").select("slug"),
        ]);
        const count = (rows: { project_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.project_id === id).length;
        const rows = ((projects ?? []) as ProjectRow[]).map((p) => ({
          project_label: projectLabel(p),
          docs: count(docs, p.id),
          products: count(products, p.id),
          assets: count(assets, p.id),
        }));
        const text = rows.map((r) => `- **${r.project_label}** — ${r.docs} doc(s), ${r.products} product(s), ${r.assets} asset(s)`).join("\n");
        return ok(`${text || "No projects."}\n\nGlobal rules: ${(globals ?? []).length}`, { projects: rows, global_rules: (globals ?? []).length });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_brief",
    {
      title: "Get Project Knowledge Brief",
      description: `THE FIRST CALL before writing captions, ad copy, creatives or image-generation prompts for a project. Returns, in order: global rules (cross-brand instructions), then the project's docs in full (nap, brand_position, icp, pain_points, graphic_rules, system_rules, memory), a list of other docs (marketing_doc… — fetch with kb_get_doc), the product list, and non-literature assets. Follow the rules it contains. For any product claim use kb_get_product.

Args: projectName (string, fuzzy).`,
      inputSchema: { projectName: z.string() },
      annotations: READ,
    },
    async ({ projectName }: { projectName: string }) => {
      try {
        const project = await findProject(projectName);
        const [{ data: globals }, { data: docs }, { data: products }, { data: assets }] = await Promise.all([
          db.from("kb_global_docs").select("slug, title, content").order("slug"),
          db.from("project_knowledge_docs").select("doc_type, slug, title, content").eq("project_id", project.id),
          db.from("project_products").select("name, slug, category, image_key").eq("project_id", project.id).order("name"),
          db.from("project_assets").select("id, kind, title, product_id, storage_key").eq("project_id", project.id).not("kind", "in", "(literature_pdf,literature_page,presentation_page)"),
        ]);
        const docRows = orderDocs((docs ?? []) as { doc_type: string; slug: string; title: string; content: string }[]);
        const lines: string[] = [`# Knowledge base — ${project.label}`, ""];
        const globalRows = (globals ?? []) as { slug: string; title: string; content: string }[];
        if (globalRows.length) {
          lines.push("# GLOBAL RULES (apply to every brand)", "");
          for (const g of globalRows) lines.push(`## ${g.title} (\`${g.slug}\`)`, g.content, "");
          lines.push("---", "");
        }
        if (!docRows.some((d) => d.doc_type === "nap")) {
          lines.push("> ⚠ No `nap` doc for this project — get name/address/phone from the brand's official website (never from product PDFs) and store it with kb_upsert_doc(docType=\"nap\").", "");
        }
        for (const d of docRows.filter((d) => INLINE_TYPES.has(d.doc_type))) lines.push(d.content, "", "---", "");
        const others = docRows.filter((d) => !INLINE_TYPES.has(d.doc_type));
        if (others.length) {
          lines.push(`## Other docs (${others.length}) — fetch with kb_get_doc`);
          for (const d of others) lines.push(`- \`${d.doc_type}/${d.slug}\` — ${d.title}`);
          lines.push("");
        }
        const productRows = (products ?? []) as { name: string; slug: string; category: string | null; image_key: string | null }[];
        lines.push(`## Products (${productRows.length})`);
        for (const p of productRows) lines.push(`- **${p.name}** (\`${p.slug}\`)${p.category ? ` — ${p.category}` : ""}${p.image_key ? " · photo" : ""}`);
        if (productRows.length) lines.push("", "Use kb_get_product for exact composition/dosage + photo + original literature pages.");
        const assetRows = (assets ?? []) as { id: string; kind: string; title: string; product_id: string | null; storage_key: string }[];
        if (assetRows.length) {
          const cdn = await cdnUrlMap(assetRows.map((a) => a.storage_key));
          lines.push("", `## Assets (${assetRows.length}) — view with kb_get_asset. Only "widget-safe" (jsDelivr) links load inside Claude web widgets/artifacts.`);
          for (const a of assetRows) {
            lines.push(`- \`${a.id}\` [${a.kind}] ${a.title}${cdn.has(a.storage_key) ? ` — widget-safe: ${cdn.get(a.storage_key)}` : ` — (not on the CDN yet) ${kbFileUrl(a.storage_key, a.title)}`}`);
          }
        }
        return ok(lines.join("\n"));
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_list_docs",
    {
      title: "List Project Docs",
      description: "Lists a project's knowledge docs (type, slug, title, length).\n\nArgs: projectName (string, fuzzy).",
      inputSchema: { projectName: z.string() },
      annotations: READ,
    },
    async ({ projectName }: { projectName: string }) => {
      try {
        const project = await findProject(projectName);
        const { data } = await db.from("project_knowledge_docs").select("doc_type, slug, title, content, updated_at").eq("project_id", project.id);
        const rows = orderDocs((data ?? []) as { doc_type: string; slug: string; title: string; content: string; updated_at: string }[]);
        return ok(rows.map((d) => `- \`${d.doc_type}/${d.slug}\` — ${d.title} (${d.content.length} chars, updated ${d.updated_at.slice(0, 10)})`).join("\n") || "No docs yet.", {
          docs: rows.map((d) => ({ doc_type: d.doc_type, slug: d.slug, title: d.title, chars: d.content.length })),
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_doc",
    {
      title: "Get One Doc",
      description: "Fetches one knowledge doc in full.\n\nArgs: projectName (string), docType (string, e.g. marketing_doc), slug (string, default 'main').",
      inputSchema: { projectName: z.string(), docType: docTypeSchema, slug: slugSchema.optional() },
      annotations: READ,
    },
    async ({ projectName, docType, slug }: { projectName: string; docType: string; slug?: string }) => {
      try {
        const project = await findProject(projectName);
        const { data } = await db.from("project_knowledge_docs").select("title, content").eq("project_id", project.id).eq("doc_type", docType).eq("slug", slug ?? "main").maybeSingle();
        if (!data) throw new Error(`No doc ${docType}/${slug ?? "main"} in ${project.label}. Use kb_list_docs.`);
        return ok(`# ${data.title}\n\n${data.content}`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_global_rules",
    {
      title: "Get Global Rules",
      description: "Returns the cross-brand rules/instructions (how to use the knowledge, how to design images, where NAP comes from…). Also included in kb_get_brief.",
      inputSchema: {},
      annotations: READ,
    },
    async () => {
      try {
        const { data } = await db.from("kb_global_docs").select("slug, title, content").order("slug");
        const rows = (data ?? []) as { slug: string; title: string; content: string }[];
        return ok(rows.map((g) => `## ${g.title} (\`${g.slug}\`)\n${g.content}`).join("\n\n") || "No global rules yet.", { rules: rows.map((g) => g.slug) });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_list_products",
    {
      title: "List Project Products",
      description: "Lists a project's products (name, slug, category, whether a photo exists).\n\nArgs: projectName (string, fuzzy).",
      inputSchema: { projectName: z.string() },
      annotations: READ,
    },
    async ({ projectName }: { projectName: string }) => {
      try {
        const project = await findProject(projectName);
        const { data } = await db.from("project_products").select("name, slug, category, image_key").eq("project_id", project.id).order("name");
        const rows = (data ?? []) as { name: string; slug: string; category: string | null; image_key: string | null }[];
        const cdn = await cdnUrlMap(rows.map((r) => r.image_key ?? ""));
        return ok(rows.map((r) => `- **${r.name}** (\`${r.slug}\`)${r.category ? ` — ${r.category}` : ""}${r.image_key ? ` · photo: ${kbFileUrl(r.image_key, r.name)}${cdn.has(r.image_key) ? ` · widget-safe: ${cdn.get(r.image_key)}` : ""}` : ""}`).join("\n") || "No products yet.", {
          count: rows.length,
          products: rows.map((r) => ({ name: r.name, slug: r.slug, category: r.category, photo_url: r.image_key ? kbFileUrl(r.image_key, r.name) : null, photo_cdn_url: r.image_key ? cdn.get(r.image_key) ?? null : null })),
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_product",
    {
      title: "Get Product Literature + Photo",
      description: `One product's EXACT literature (markdown: composition, indications, dosage, packing) — the ground truth to quote, never approximate a number — together with its primary product photo, any extra product photos, and (by default) images of the ORIGINAL literature pages plus a PDF download link, so you can see the real layout/Urdu text next to the extracted data.

Args: projectName (string), productName (string, fuzzy on name/slug), includeLiterature (boolean, default true).`,
      inputSchema: { projectName: z.string(), productName: z.string(), includeLiterature: z.boolean().optional() },
      annotations: READ,
    },
    async ({ projectName, productName, includeLiterature }: { projectName: string; productName: string; includeLiterature?: boolean }) => {
      try {
        const project = await findProject(projectName);
        const product = await findProduct(project.id, productName);
        const { data } = await db.from("project_assets").select("id, project_id, product_id, kind, title, storage_key, content_type, notes, sort").eq("product_id", product.id).order("sort");
        const assets = (data ?? []) as AssetRow[];
        const lit = includeLiterature !== false;
        const cdn = await cdnUrlMap([product.image_key ?? "", ...assets.map((x) => x.storage_key)]);
        const fileLine = (label: string, key: string, title: string) =>
          `- ${label}: ${kbFileUrl(key, title)}${cdn.has(key) ? `\n  Widget-safe (jsDelivr): ${cdn.get(key)}` : ""}`;
        const urlLines: string[] = [];
        if (product.image_key) urlLines.push(fileLine("Primary photo", product.image_key, product.name));
        for (const x of assets.filter((y) => y.kind === "product_image")) urlLines.push(fileLine(`Photo "${x.title}"`, x.storage_key, x.title));
        const presentation = assets.filter((y) => y.kind === "presentation_page");
        for (const x of presentation) urlLines.push(fileLine(`Presentation page "${x.title}"`, x.storage_key, x.title));
        if (lit) for (const x of assets.filter((y) => y.kind === "literature_page" || y.kind === "literature_pdf")) urlLines.push(fileLine(x.title, x.storage_key, x.title));
        // Pack photos and label print files: links only (open one when you need it).
        for (const x of assets.filter((y) => y.kind === "reference_image")) {
          const note = x.notes ? `\n  Note: ${x.notes.length > 220 ? `${x.notes.slice(0, 217)}...` : x.notes}` : "";
          urlLines.push(`${fileLine(`Reference "${x.title}"`, x.storage_key, x.title)}${note}`);
        }
        const content: Block[] = [{ type: "text", text: product.content }];
        if (urlLines.length) {
          const missing = urlLines.length > 0 && [...urlLines].some((l) => !l.includes("Widget-safe"));
          content.push({
            type: "text",
            text: `Permanent public URLs (for <img>/SVG outside Claude web; add &w=800&fmt=jpg for a smaller rendition):\n${urlLines.join("\n")}${missing ? "\n\nFiles without a Widget-safe (jsDelivr) URL will NOT render inside Claude web widgets/artifacts — ask the user, then use kb_publish_to_cdn." : ""}`,
          });
        }
        if (product.image_key) {
          try {
            content.push({ type: "text", text: "Primary product photo:" }, await imageBlock(product.image_key));
          } catch {
            content.push({ type: "text", text: "(primary photo missing from storage)" });
          }
        } else {
          content.push({ type: "text", text: "No finished product photo on file — see the literature pages below." });
        }
        for (const a of assets.filter((x) => x.kind === "product_image").slice(0, 3)) content.push(...(await assetBlocks(a, cdn)));
        if (presentation.length) {
          content.push({ type: "text", text: "Designed A4 presentation pages for this product (1 = cover, 2 = English data sheet, 3 = Urdu). Check each page's note for its approval status before treating it as final:" });
          for (const a of presentation) content.push(...(await assetBlocks(a, cdn)));
        }
        if (lit) {
          for (const a of assets.filter((x) => x.kind === "literature_page")) content.push(...(await assetBlocks(a, cdn)));
          for (const a of assets.filter((x) => x.kind === "literature_pdf")) content.push(...(await assetBlocks(a, cdn)));
        }
        return { content };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_social_post",
    {
      title: "Get Social Post Brief By Calendar Day",
      description: `Use this when the user asks for a social media post by calendar day ("Day 1 ki social media post design karo", "Day 2", "poora calendar"). Returns everything needed to design that day's post: the final image-generation prompt (the day's entry from the project's content calendar merged with its social-post design lock — locked copy, layout, brand colours and product rules), the caption to post, full-resolution download links for the original images to attach (logo first, then the approved product photo), and the images themselves.

Then generate the graphic with your image tool (GPT image / Nano Banana), attaching exactly these images in this order, and give the user the caption. Do not change any text, add claims, redraw/recolour the product, or leave the brand palette. For "poora calendar", call this for day 1, 2, 3… one at a time.

Args: projectName (string), day (number, 1-based), calendarSlug (optional marketing_doc slug; default = the project's newest content-calendar doc).`,
      inputSchema: { projectName: z.string(), day: z.number().int().min(1), calendarSlug: slugSchema.optional() },
      annotations: READ,
    },
    async ({ projectName, day, calendarSlug }: { projectName: string; day: number; calendarSlug?: string }) => {
      try {
        const project = await findProject(projectName);
        const { data: docs } = await db
          .from("project_knowledge_docs")
          .select("slug, content, updated_at")
          .eq("project_id", project.id)
          .eq("doc_type", "marketing_doc")
          .order("updated_at", { ascending: false });
        const all = (docs ?? []) as { slug: string; content: string }[];
        const calendar = calendarSlug ? all.find((d) => d.slug === calendarSlug) : all.find((d) => d.slug.startsWith("content-calendar"));
        if (!calendar) throw new Error(`No content calendar for ${project.label}${calendarSlug ? ` with slug "${calendarSlug}"` : ""}. Save one as a marketing_doc whose slug starts with "content-calendar".`);
        const lockDoc = all.find((d) => d.slug === "social-post-design-lock");
        if (!lockDoc) throw new Error(`No "social-post-design-lock" marketing_doc for ${project.label}.`);
        const days = jsonBlock(calendar.content, calendar.slug) as Record<string, unknown>[];
        const entry = days.find((d) => Number(d.post ?? d.day) === day);
        if (!entry) throw new Error(`Day ${day} is not in ${calendar.slug} (it has days 1–${days.length}).`);
        const heading = `Day ${day} — ${String(entry.pillar ?? "")}${entry.product ? ` — ${String(entry.product)}` : ""}`;
        const brief = `${project.name} social media post — Day ${day} of ${calendar.slug}`;
        const { data: products } = await db.from("project_products").select("name, slug").eq("project_id", project.id);
        const productNames = ((products ?? []) as { name: string; slug: string }[]).flatMap((p) => [p.name, p.slug]);
        return { content: await designBriefBlocks(heading, brief, jsonBlock(lockDoc.content, lockDoc.slug), entry, `day-${day}`, productNames, days) };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_product_post",
    {
      title: "Get Product Brief Post",
      description: `Use this when the user asks for a product's social media presentation post ("Aminotox ki brief post design karo", "product post", "brief post"). Separate from the content calendar: one post per product that presents it like a brochure page, with the important points from the original brochure. Returns the final image-generation prompt (the product's entry from the project's \`product-brief-posts\` doc merged with its social-post design lock), the caption to post, and the original images to attach (logo first, then the approved product photo).

Then generate the graphic with your image tool (GPT image / Nano Banana), attaching exactly these images in this order, and give the user the caption. Do not change any text, add claims, redraw/recolour the product, or leave the brand palette.

Args: projectName (string), productName (string), category (optional: "english" by default; the doc may also have "urdu", "mix" or others).`,
      inputSchema: { projectName: z.string(), productName: z.string(), category: slugSchema.optional() },
      annotations: READ,
    },
    async ({ projectName, productName, category }: { projectName: string; productName: string; category?: string }) => {
      try {
        const project = await findProject(projectName);
        const { data: docs } = await db
          .from("project_knowledge_docs")
          .select("slug, content")
          .eq("project_id", project.id)
          .eq("doc_type", "marketing_doc")
          .in("slug", ["product-brief-posts", "social-post-design-lock"]);
        const all = (docs ?? []) as { slug: string; content: string }[];
        const postsDoc = all.find((d) => d.slug === "product-brief-posts");
        if (!postsDoc) throw new Error(`No "product-brief-posts" marketing_doc for ${project.label}.`);
        const lockDoc = all.find((d) => d.slug === "social-post-design-lock");
        if (!lockDoc) throw new Error(`No "social-post-design-lock" marketing_doc for ${project.label}.`);

        const categories = jsonBlock(postsDoc.content, postsDoc.slug) as Record<string, Record<string, unknown>[]>;
        const cat = category ?? "english";
        const list = categories[cat];
        if (!Array.isArray(list) || !list.length) {
          const filled = Object.keys(categories).filter((k) => Array.isArray(categories[k]) && categories[k].length);
          throw new Error(`No "${cat}" product posts for ${project.label} yet (categories with posts: ${filled.join(", ") || "none"}).`);
        }
        const norm = (s: unknown) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
        const want = norm(productName);
        const entry = list.find((e) => norm(e.product) === want) ?? list.find((e) => norm(e.product).startsWith(want));
        if (!entry) throw new Error(`No "${cat}" product post for "${productName}". Available: ${list.map((e) => String(e.product)).join(", ")}.`);

        const heading = `${String(entry.product)} — product brief post (${cat})`;
        const brief = `${project.name} product brief post — ${String(entry.product)} (${cat})`;
        return { content: await designBriefBlocks(heading, brief, jsonBlock(lockDoc.content, lockDoc.slug), entry, slugifyName(String(entry.product)), [], list) };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_occasion_post",
    {
      title: "Get Jummah / Occasion Post Brief",
      description: `Use this when the user asks for a Jummah / Friday post or a post for an Islamic, national or industry day for ANY project ("Jumma post banao", "Eid post", "14 August post", "Kashmir day post", "Laylat al-Qadr post", "World Egg Day post", "AMR awareness week post", "World Animal Day post"). Returns the global occasion rule (what stays fixed, what to create for the day, Arabic/Urdu rules), the occasion's motifs and names, the verified Arabic/Urdu texts to use, this time's background style (Jummah posts rotate weekly so no two Fridays look alike), the project's fixed brand items (logo, palette, typography, footer strip) and its occasion reference images.

Then design the post: a background made for the occasion in the given style, the brand items unchanged, and ONLY the approved words from the project's \`occasion-copy\` doc (returned as text_on_image + caption). The words are ours: if none are approved yet the tool says STOP — draft them for the user's approval, save them, then design. Never put a product, claim or call to action on these posts.

Args: projectName, occasion (e.g. "jummah", "eid ul fitr", "pakistan day", "laylat al qadr", "kashmir day"), language ("english" | "urdu" | "arabic" | "mix", default "mix"), date (optional YYYY-MM-DD — picks the style; default today).`,
      inputSchema: {
        projectName: z.string(),
        occasion: z.string().min(2),
        language: z.enum(["english", "urdu", "arabic", "mix"]).optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
      annotations: READ,
    },
    async ({ projectName, occasion, language = "mix", date }: { projectName: string; occasion: string; language?: "english" | "urdu" | "arabic" | "mix"; date?: string }) => {
      try {
        const project = await findProject(projectName);
        const { data: ruleRow } = await db.from("kb_global_docs").select("content").eq("slug", "occasion-posts").maybeSingle();
        if (!ruleRow) throw new Error('The global rule "occasion-posts" is missing.');
        type Occasion = { kind?: "islamic" | "national" | "international"; names: Record<string, string>; motifs: string; date?: string; fits?: string; message_ideas?: string[]; texts?: string[] };
        const data = jsonBlock(ruleRow.content, "occasion-posts") as {
          style_families: { id: string; name: string; look: string }[];
          /** Non-religious looks for national and international days. */
          day_style_families?: { id: string; name: string; look: string }[];
          occasions: Record<string, Occasion>;
          verified_texts: Record<string, { arabic: string; urdu: string; reference: string }>;
        };

        const key = resolveOccasionKey(data.occasions, occasion);
        const occ = key ? data.occasions[key] : null;

        // Style: rotates by week so consecutive Fridays never look alike.
        const day = date ? new Date(`${date}T12:00:00Z`) : new Date();
        const jan1 = Date.UTC(day.getUTCFullYear(), 0, 1);
        const week = Math.floor((day.getTime() - jan1) / (7 * 86400000));
        // Islamic occasions use the Islamic families; national/international
        // days (and unknown occasions) use the non-religious day families.
        const islamic = occ?.kind ? occ.kind === "islamic" : Boolean(occ);
        const families = islamic || !data.day_style_families?.length ? data.style_families : data.day_style_families;
        const style = families[(week + (key && key !== "jummah" ? 2 : 0)) % families.length];

        // The project's fixed brand items.
        const { data: docs } = await db.from("project_knowledge_docs").select("doc_type, slug, content").eq("project_id", project.id);
        const docList = (docs ?? []) as { doc_type: string; slug: string; content: string }[];
        const lockDoc = docList.find((d) => d.slug === "social-post-design-lock");
        let fixed: Record<string, unknown> = {};
        if (lockDoc) {
          try {
            const lock = jsonBlock(lockDoc.content, lockDoc.slug) as Record<string, unknown>;
            fixed = {
              logo: (lock.attached_images as Record<string, unknown> | undefined)?.logo ?? null,
              // Where the logo goes (e.g. Tad: top-centre on greetings) and the project's design system.
              logo_place: ((lock.locked as string[] | undefined) ?? []).find((l) => /LOGO/.test(l)) ?? null,
              design_system: lock.design_system ?? null,
              brand_palette_only: lock.brand_palette_only ?? null,
              typography: lock.typography ?? null,
              footer_strip: lock.footer_strip ?? null,
            };
          } catch {
            fixed = { note: "The project's design lock could not be read — use its brand kit and graphic rules below." };
          }
        }
        const brandKit = docList.find((d) => d.doc_type === "brand_kit")?.content ?? null;
        const graphicRules = docList.find((d) => d.doc_type === "graphic_rules")?.content ?? null;
        const nap = docList.find((d) => d.doc_type === "nap")?.content ?? null;

        const { data: assetRows } = await db
          .from("project_assets")
          .select("id, project_id, product_id, kind, title, storage_key, content_type, notes, sort")
          .eq("project_id", project.id)
          .or("kind.eq.logo,title.like.Occasion reference*")
          .order("created_at");
        const assets = (assetRows ?? []) as AssetRow[];
        const logo = assets.find((a) => a.kind === "logo");
        const refs = assets.filter((a) => a.title.startsWith("Occasion reference"));

        // The words are OURS (Shoaib, 2026-10-03: "Content bhi apny khud create kerna hai wo ai per nai
        // chorna"): approved copy lives in the project's `occasion-copy` doc; the designer never writes it.
        type CopyVariant = { approved?: boolean; date?: string; language?: string; text_on_image: Record<string, string>; caption?: string };
        let variants: CopyVariant[] = [];
        const copyDoc = docList.find((d) => d.slug === "occasion-copy");
        if (copyDoc && key) {
          try {
            variants = ((jsonBlock(copyDoc.content, "occasion-copy") as Record<string, CopyVariant[]>)[key] ?? []).filter((v) => v && v.text_on_image);
          } catch {
            /* an unreadable copy doc counts as no approved copy */
          }
        }
        const approved = variants.filter((v) => v.approved === true);
        const sameLang = approved.filter((v) => !v.language || v.language === language);
        const pool = sameLang.length ? sameLang : approved;
        // A variant written for this date wins (Jummah: one new verse/hadith/dua per Friday);
        // otherwise the approved ones rotate by week.
        const dayIso = date ?? new Date().toISOString().slice(0, 10);
        const chosen = pool.find((v) => v.date === dayIso) ?? (pool.length ? pool[week % pool.length] : null);
        const allDrafts = variants.filter((v) => v.approved !== true);
        const drafts = allDrafts.some((v) => v.date === dayIso) ? allDrafts.filter((v) => v.date === dayIso) : allDrafts.slice(0, 3);

        const texts = (occ?.texts ?? []).map((t) => ({ id: t, ...data.verified_texts[t] })).filter((t) => t.arabic);
        const prompt = {
          brief: `${project.name} — ${occ?.names.english ?? occasion} post (${language})`,
          size: "1080 × 1350 px (Instagram 4:5)",
          design_rule_every_project: await globalRule("design-glass-light"),
          layout_rule_every_project: await globalRule("layout-alignment"),
          occasion: occ ? { key, ...occ } : { asked: occasion, note: "Not in the occasion list — follow the general rule and confirm motifs and wording with the user. If this is the brand's own event (expo, seminar, launch, anniversary, new partner…), use the global rule `event-posts` instead: real facts and photos only." },
          style_this_time: style,
          language,
          verified_texts: texts,
          text_on_image: chosen ? chosen.text_on_image : null,
          text_rule: chosen
            ? "Use ONLY the approved words in text_on_image, character for character (Arabic/Urdu letter-perfect). Write no other words — no extra greeting, message, slogan or hashtag on the image."
            : "NO APPROVED WORDS YET — do not design this post.",
          fixed_brand_items: { ...fixed, contact_details_from_nap: nap ? "see the nap doc below" : "no nap doc — ask the user" },
          not_on_this_post: [
            "product packs, product names, claims, doses, prices, offers or any call to action",
            "the vet line (\"Vet — Not for human use. Veterinary use only.\") or any product disclaimer — those are for product posts only",
            "faces of real people, depictions of Prophets or holy persons, altered holy sites",
            "violent, sad or blood imagery",
          ],
          arabic_urdu: !islamic
            ? "No Arabic on this post. Bold English headline; an Urdu line only when the language is urdu or mix, set as typed text in Jameel Noori Nastaleeq and checked letter by letter."
            : "Generate the background with no text, then set every Arabic/Urdu/English line as typed text (Arabic: Amiri / Noto Naskh Arabic; Urdu: Jameel Noori Nastaleeq). If the image is made in one go, use only the exact phrases above and check every letter, dot and diacritic; show each verse's reference.",
        };

        const content: Block[] = [
          {
            type: "text",
            text: `${occ?.names.english ?? occasion} — ${project.label}\n\nSTEP 1. Attach the logo${logo ? `: ${kbFileUrl(logo.storage_key, `${project.name}-logo`)}` : " (none stored — ask the user for it)"}\n${chosen ? `STEP 2. Design with this brief — background in "${style.name}" style made for the occasion; the words are ONLY the approved text_on_image, exactly:` : `STOP — there are no APPROVED words for this occasion yet. The words are ours, never the designer's: do not design and do not invent a message or caption. Draft the words (headline, message, the sign-off "From the team at ${project.name}", and the caption: greeting, one line of dua or message, sign-off, 3–5 hashtags; no contact block, no CTA) using only the occasion names, the verified texts and the rule below. Show them to the user. After the user approves, save them in the project's marketing_doc "occasion-copy" with kb_upsert_doc (JSON: {"${key ?? "occasion_key"}": [{"approved": true, "language": "${language}", "text_on_image": {…}, "caption": "…"}]}), then call this tool again.${drafts.length ? `\n\nDRAFTS WAITING FOR APPROVAL (show these to the user):\n${JSON.stringify(drafts, null, 2)}` : ""}\n\nBrief for later:`}\n\n\`\`\`json\n${JSON.stringify(prompt, null, 2)}\n\`\`\`\n\n${chosen ? `STEP 3. Check: logo unchanged, brand colours only, the project's footer strip exactly as specified, every word exactly as approved, Arabic/Urdu letter-perfect, no product/claim/CTA, no vet line. ${SELF_CHECK}\n\nCAPTION TO POST (approved — give it as-is):\n\n${chosen.caption ?? "(no approved caption — ask the user)"}` : ""}\n\nGLOBAL RULE (occasion-posts):\n\n${ruleRow.content.replace(/```json[\s\S]*?```/, "(data above)")}`,
          },
        ];
        if (brandKit || graphicRules || nap) {
          content.push({
            type: "text",
            text: [brandKit && `BRAND KIT:\n${brandKit}`, graphicRules && `GRAPHIC RULES:\n${graphicRules}`, nap && `CONTACT DETAILS (nap — for the footer strip only):\n${nap}`].filter(Boolean).join("\n\n"),
          });
        }
        if (logo) {
          try {
            content.push({ type: "text", text: "Logo (attach as-is):" }, await imageBlock(logo.storage_key));
          } catch {
            content.push({ type: "text", text: "Logo missing from storage — use the URL above." });
          }
        }
        if (refs.length) {
          content.push({ type: "text", text: `Occasion references for ${project.name} (learn the level and approach — never copy, never attach):` });
          for (const r of refs.slice(0, 6)) {
            try {
              const { buffer } = await fetchObject(r.storage_key);
              const small = await sharp(buffer).flatten({ background: "#ffffff" }).resize({ width: 300, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
              content.push({ type: "text", text: r.title }, { type: "image", data: small.toString("base64"), mimeType: "image/jpeg" });
            } catch {
              /* skip a missing reference */
            }
          }
        }
        return { content };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_list_occasion_copy",
    {
      title: "List Occasion Copy (approved / pending)",
      description: `Shows a project's approved and pending words for Jummah and dated posts (its \`occasion-copy\` doc): per occasion, each entry's date, approved or pending, the text used (verse / hadith / dua id) and the headline. Use it to see what is ready to design, what still needs the user's approval, and the next dated posts.

Args: projectName, occasion (optional — e.g. "jummah", "world egg day"), from (optional YYYY-MM-DD — list only entries on or after this date).`,
      inputSchema: {
        projectName: z.string(),
        occasion: z.string().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
      annotations: READ,
    },
    async ({ projectName, occasion, from }: { projectName: string; occasion?: string; from?: string }) => {
      try {
        const project = await findProject(projectName);
        const doc = await readOccasionCopy(project.id);
        if (!doc) return { content: [{ type: "text", text: `${project.label} has no occasion-copy doc yet — no approved words for Jummah or dated posts.` }] };
        const only = occasion ? resolveOccasionKey(await occasionKeys(), occasion) ?? occasion : null;
        const lines: string[] = [];
        for (const [key, list] of Object.entries(doc.copy)) {
          if (only && key !== only) continue;
          const rows = list.filter((v) => !from || !v.date || v.date >= from);
          if (!rows.length) continue;
          const ok = rows.filter((v) => v.approved === true).length;
          lines.push(`${key} — ${ok} approved, ${rows.length - ok} pending`);
          for (const v of rows) {
            const t = v.text_on_image ?? {};
            lines.push(`  ${v.approved ? "✅" : "⏳"} ${v.date ?? "(any date)"} ${v.text_id ? `[${v.text_id}] ` : ""}${t.reference ?? t.headline ?? ""}${t.message ? ` — ${t.message}` : t.english_meaning ? ` — ${t.english_meaning}` : ""}`);
          }
        }
        return { content: [{ type: "text", text: lines.length ? `${project.label} — occasion copy\n\n${lines.join("\n")}` : "Nothing matches." }] };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_save_occasion_copy",
    {
      title: "Save Occasion Copy (draft or approved)",
      description: `Adds or replaces the words for one Jummah / dated post in a project's \`occasion-copy\` doc, in the right format. The words are OURS (global rule \`content-ours\`): save drafts with approved=false, show them to the user, and set approved=true only after the user approved these exact words in chat. Same occasion + date replaces that entry; without a date the entry is added.

Args: projectName, occasion (key or name), text_on_image (object of the exact words, e.g. {"headline": "...", "message": "...", "sign_off": "From the team at <Brand>"}; Jummah: arabic_headline, headline, arabic_text, english_meaning, reference, sign_off — Arabic only from verified_texts), caption (exact caption), date (optional YYYY-MM-DD), language (default "english"), text_id (optional verified_texts id), approved (default false).`,
      inputSchema: {
        projectName: z.string(),
        occasion: z.string().min(2),
        text_on_image: z.record(z.string(), z.string()),
        caption: z.string().min(1),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        language: z.string().optional(),
        text_id: z.string().optional(),
        approved: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async (args: { projectName: string; occasion: string; text_on_image: Record<string, string>; caption: string; date?: string; language?: string; text_id?: string; approved?: boolean }) => {
      try {
        const project = await findProject(args.projectName);
        const key = resolveOccasionKey(await occasionKeys(), args.occasion);
        if (!key) throw new Error(`"${args.occasion}" is not in the occasion list (global rule occasion-posts).`);
        const doc = (await readOccasionCopy(project.id)) ?? {
          title: "Occasion copy — approved words for Jummah and dated posts",
          intro: `# Occasion copy (${project.name})\n\nThe words on every occasion post and its caption are **ours** (global rule \`content-ours\`). \`kb_get_occasion_post\` uses only entries with \`"approved": true\`; drafts are shown for approval and never designed.`,
          copy: {},
        };
        const entry: OccasionCopyVariant = {
          approved: args.approved === true,
          ...(args.approved ? { approved_by: `the user, ${new Date().toISOString().slice(0, 10)}` } : {}),
          ...(args.date ? { date: args.date } : {}),
          language: args.language ?? "english",
          ...(args.text_id ? { text_id: args.text_id } : {}),
          text_on_image: args.text_on_image,
          caption: args.caption,
        };
        const list = doc.copy[key] ?? [];
        const at = args.date ? list.findIndex((v) => v.date === args.date) : -1;
        if (at >= 0) list[at] = entry;
        else list.push(entry);
        doc.copy[key] = list;
        await writeOccasionCopy(project.id, doc.title, doc.intro, doc.copy);
        return { content: [{ type: "text", text: `Saved ${entry.approved ? "APPROVED" : "draft"} ${key}${args.date ? ` for ${args.date}` : ""} in ${project.label}'s occasion-copy (${at >= 0 ? "replaced" : "added"}).` }] };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_approve_occasion_copy",
    {
      title: "Approve Occasion Copy",
      description: `Marks pending words in a project's \`occasion-copy\` doc as approved, so \`kb_get_occasion_post\` can design them. Call it ONLY after the user approved those exact words in chat ("approved", "theek hai", "haan") — never on your own.

Args: projectName, occasion (key or name), date (optional YYYY-MM-DD — one entry), all (optional true — every pending entry of that occasion).`,
      inputSchema: {
        projectName: z.string(),
        occasion: z.string().min(2),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        all: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async ({ projectName, occasion, date, all }: { projectName: string; occasion: string; date?: string; all?: boolean }) => {
      try {
        const project = await findProject(projectName);
        const key = resolveOccasionKey(await occasionKeys(), occasion);
        const doc = await readOccasionCopy(project.id);
        if (!key || !doc || !doc.copy[key]?.length) throw new Error(`No occasion-copy entries for "${occasion}" in ${project.label}.`);
        if (!date && !all && doc.copy[key].filter((v) => v.approved !== true).length > 1) throw new Error("Several pending entries — pass a date, or all=true.");
        const stamp = `the user, ${new Date().toISOString().slice(0, 10)}`;
        let n = 0;
        for (const v of doc.copy[key]) {
          if (v.approved === true) continue;
          if (date && v.date !== date) continue;
          v.approved = true;
          v.approved_by = stamp;
          n++;
        }
        if (!n) throw new Error("Nothing pending matched.");
        await writeOccasionCopy(project.id, doc.title, doc.intro, doc.copy);
        return { content: [{ type: "text", text: `Approved ${n} ${key} entr${n === 1 ? "y" : "ies"} in ${project.label}. They can be designed now with kb_get_occasion_post.` }] };
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_list_assets",
    {
      title: "List Assets",
      description: "Lists stored files (product photos, literature, reference images, logos, documents) with ids and permanent public URLs. Use recent=true right after the user uploaded via an upload link to see the newest files.\n\nArgs: projectName (string), kind (optional), productName (optional), recent (optional).",
      inputSchema: { projectName: z.string(), kind: z.string().optional(), productName: z.string().optional(), recent: z.boolean().optional() },
      annotations: READ,
    },
    async ({ projectName, kind, productName, recent }: { projectName: string; kind?: string; productName?: string; recent?: boolean }) => {
      try {
        const project = await findProject(projectName);
        let query = db.from("project_assets").select("id, kind, title, content_type, notes, product_id, storage_key").eq("project_id", project.id);
        query = recent ? query.order("created_at", { ascending: false }).limit(10) : query.order("kind").order("sort");
        if (kind) query = query.eq("kind", kind);
        if (productName) query = query.eq("product_id", (await findProduct(project.id, productName)).id);
        const { data } = await query;
        const raw = (data ?? []) as { id: string; kind: string; title: string; content_type: string; notes: string | null; storage_key: string }[];
        const cdn = await cdnUrlMap(raw.map((a) => a.storage_key));
        const rows = raw.map(({ storage_key, ...a }) => ({ ...a, url: kbFileUrl(storage_key, a.title), cdn_url: cdn.get(storage_key) ?? null }));
        return ok(rows.map((a) => `- \`${a.id}\` [${a.kind}] ${a.title} (${a.content_type})${a.notes ? ` — ${a.notes}` : ""}\n  ${a.url}${a.cdn_url ? `\n  widget-safe: ${a.cdn_url}` : ""}`).join("\n") || "No assets.", { count: rows.length, assets: rows });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_get_asset",
    {
      title: "View An Asset",
      description: "Returns a stored image (view it directly) or, for PDFs, a download link.\n\nArgs: assetId (uuid, from kb_list_assets / kb_get_brief).",
      inputSchema: { assetId: z.string().uuid() },
      annotations: READ,
    },
    async ({ assetId }: { assetId: string }) => {
      try {
        const { data } = await db.from("project_assets").select("id, project_id, product_id, kind, title, storage_key, content_type, notes, sort").eq("id", assetId).maybeSingle();
        if (!data) throw new Error(`No asset ${assetId}.`);
        return { content: await assetBlocks(data as AssetRow, await cdnUrlMap([data.storage_key])) };
      } catch (error) {
        return fail(error);
      }
    }
  );

  // ── write ─────────────────────────────────────────────────────

  server.registerTool(
    "kb_upsert_doc",
    {
      title: "Create/Update A Doc",
      description: `Creates or updates a knowledge doc for a project. docType is an open slug: well-known ones are nap, brand_position, icp, pain_points, graphic_rules, system_rules (rules for using this knowledge / designing images for this brand), marketing_doc (many — give each its own slug), memory (running notes). Same docType+slug = update.

RULES: NAP (name/address/phone/email) goes ONLY in the \`nap\` doc and must be taken from the brand's official website, never from product PDFs/labels; never put contact details in branding docs.

Args: projectName, docType, slug (default 'main'), title (required when creating), content (markdown), mode ('replace' default | 'append').`,
      inputSchema: {
        projectName: z.string(),
        docType: docTypeSchema,
        slug: slugSchema.optional(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().min(1),
        mode: z.enum(["replace", "append"]).optional(),
      },
      annotations: WRITE,
    },
    async ({ projectName, docType, slug, title, content, mode }: { projectName: string; docType: string; slug?: string; title?: string; content: string; mode?: "replace" | "append" }) => {
      try {
        const project = await findProject(projectName);
        const s = slug ?? "main";
        const { data: existing } = await db.from("project_knowledge_docs").select("title, content").eq("project_id", project.id).eq("doc_type", docType).eq("slug", s).maybeSingle();
        const finalTitle = title ?? existing?.title;
        if (!finalTitle) throw new Error("title is required when creating a new doc.");
        const merged = mergeContent(existing?.content, content, mode ?? "replace");
        const { error } = await db.from("project_knowledge_docs").upsert(
          { project_id: project.id, doc_type: docType, slug: s, title: finalTitle, content: merged, updated_at: new Date().toISOString() },
          { onConflict: "project_id,doc_type,slug" }
        );
        if (error) throw new Error(error.message);
        return ok(`${existing ? "Updated" : "Created"} ${docType}/${s} for ${project.label} (${merged.length} chars).`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_delete_doc",
    {
      title: "Delete A Doc",
      description: "Permanently deletes one knowledge doc. Requires confirm=true.\n\nArgs: projectName, docType, slug (default 'main'), confirm.",
      inputSchema: { projectName: z.string(), docType: docTypeSchema, slug: slugSchema.optional(), confirm: confirmSchema },
      annotations: DELETE,
    },
    async ({ projectName, docType, slug, confirm }: { projectName: string; docType: string; slug?: string; confirm?: boolean }) => {
      try {
        const project = await findProject(projectName);
        const s = slug ?? "main";
        if (!confirm) return needConfirm(`the doc ${docType}/${s} of ${project.label}`);
        const { data, error } = await db.from("project_knowledge_docs").delete().eq("project_id", project.id).eq("doc_type", docType).eq("slug", s).select("id");
        if (error) throw new Error(error.message);
        return ok((data ?? []).length ? `Deleted ${docType}/${s}.` : `No doc ${docType}/${s} found.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_upsert_product",
    {
      title: "Create/Update A Product",
      description: `Creates or updates a product's literature entry. Content must be the product's EXACT data from the manufacturer literature (composition, indications, dosage, packing) — never invented. Same slug = update. Add its photo/literature afterwards with kb_add_asset.

Args: projectName, name (required when creating), slug (optional, derived from name), category (optional), content (markdown), mode ('replace' | 'append').`,
      inputSchema: {
        projectName: z.string(),
        name: z.string().min(1).max(120),
        slug: slugSchema.optional(),
        category: z.string().max(120).optional(),
        content: z.string().min(1),
        mode: z.enum(["replace", "append"]).optional(),
      },
      annotations: WRITE,
    },
    async ({ projectName, name, slug, category, content, mode }: { projectName: string; name: string; slug?: string; category?: string; content: string; mode?: "replace" | "append" }) => {
      try {
        const project = await findProject(projectName);
        const s = slug ?? slugify(name);
        const { data: existing } = await db.from("project_products").select("content, category").eq("project_id", project.id).eq("slug", s).maybeSingle();
        const merged = mergeContent(existing?.content, content, mode ?? "replace");
        const { error } = await db.from("project_products").upsert(
          { project_id: project.id, slug: s, name, category: category ?? existing?.category ?? null, content: merged, updated_at: new Date().toISOString() },
          { onConflict: "project_id,slug" }
        );
        if (error) throw new Error(error.message);
        return ok(`${existing ? "Updated" : "Created"} product ${name} (\`${s}\`) in ${project.label}.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_delete_product",
    {
      title: "Delete A Product",
      description: "Permanently deletes a product and all its stored files. Requires confirm=true.\n\nArgs: projectName, productName, confirm.",
      inputSchema: { projectName: z.string(), productName: z.string(), confirm: confirmSchema },
      annotations: DELETE,
    },
    async ({ projectName, productName, confirm }: { projectName: string; productName: string; confirm?: boolean }) => {
      try {
        const project = await findProject(projectName);
        const product = await findProduct(project.id, productName);
        if (!confirm) return needConfirm(`the product ${product.name} of ${project.label} with all its photos/literature`);
        const { data: assets } = await db.from("project_assets").select("storage_key").eq("product_id", product.id);
        const { error } = await db.from("project_products").delete().eq("id", product.id);
        if (error) throw new Error(error.message);
        await Promise.all([...(assets ?? []).map((a: { storage_key: string }) => safeDelete(a.storage_key)), safeDelete(product.image_key)]);
        return ok(`Deleted product ${product.name}.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_add_asset",
    {
      title: "Add An Image / Document",
      description: `Stores a file in the project's knowledge base: a product photo, a reference image for design, a logo, or a document (PDF). Provide the file as sourceUrl (public https link — best), dataBase64 (small files), or${allowLocalFiles ? " filePath (local)," : ""} exactly one of them. Images: png/jpg/webp/gif; documents: PDF.

Kinds: product_image (needs productName; makePrimary=true — or if the product has no photo yet — makes it the main photo), reference_image, logo, document, other.

Args: projectName, kind, title, productName (for product_image), notes (optional, e.g. what to imitate), makePrimary (optional), plus the file.`,
      inputSchema: {
        projectName: z.string(),
        kind: z.enum(ASSET_KINDS),
        title: z.string().min(1).max(200),
        productName: z.string().optional(),
        notes: z.string().max(2000).optional(),
        makePrimary: z.boolean().optional(),
        ...fileArgs,
      },
      annotations: { ...WRITE, idempotentHint: false, openWorldHint: true },
    },
    async (args: { projectName: string; kind: (typeof ASSET_KINDS)[number]; title: string; productName?: string; notes?: string; makePrimary?: boolean } & FileSource) => {
      try {
        const project = await findProject(args.projectName);
        const product = args.productName ? await findProduct(project.id, args.productName) : null;
        if (args.kind === "product_image" && !product) throw new Error("kind=product_image needs productName.");
        const file = await loadFile(args, allowLocalFiles);
        if (args.kind !== "document" && args.kind !== "other" && !file.mime.startsWith("image/")) throw new Error(`kind=${args.kind} must be an image.`);
        const key = `knowledge/${project.id}/assets/${randomUUID()}.${file.ext}`;
        await uploadObject(key, file.buffer, file.mime);
        const asset = await registerAsset({
          projectId: project.id,
          productId: product?.id ?? null,
          kind: args.kind,
          title: args.title,
          key,
          contentType: file.mime,
          notes: args.notes,
          makePrimary: args.makePrimary,
        });
        const primary = asset.primary ? " Set as the product's primary photo." : "";
        return ok(`Stored ${args.kind} "${args.title}" (asset \`${asset.id}\`, ${Math.round(file.buffer.length / 1024)} KB).${primary}\nURL: ${asset.url}`, { asset_id: asset.id, url: asset.url });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_publish_to_cdn",
    {
      title: "Publish Images To The Public CDN (for Claude web)",
      description: `Copies knowledge-base IMAGES into the shared PUBLIC GitHub repo (${CDN_REPO}) served by cdn.jsdelivr.net and gives each a widget-safe URL. Needed because Claude web's widget/artifact sandbox blocks every image origin except a few CDNs (jsDelivr is one) — adsbyshoaib.com URLs show as broken images there. Works for every project (files go under <project-slug>/…).

PUBLIC and effectively permanent (CDN-cached): only publish material that may be public — product photos, brochure pages — never client-private files. Show the user what will be published and get a yes; then call with confirm=true (without it you only get a preview).

Targets: 'product' (that product's photo + extra photos + literature pages), 'all_products' (every product of the project), 'asset' (one image asset by id, e.g. a reference image the user explicitly wants public). includeLiterature (default true) applies to product targets. Idempotent (already-published files are reused). At most 8 files per call — if 'remaining' > 0 call again.

Args: projectName, target, productName (target=product), assetId (target=asset), includeLiterature, confirm.`,
      inputSchema: {
        projectName: z.string(),
        target: z.enum(["product", "all_products", "asset"]),
        productName: z.string().optional(),
        assetId: z.string().uuid().optional(),
        includeLiterature: z.boolean().optional(),
        confirm: confirmSchema,
      },
      annotations: { ...WRITE, openWorldHint: true },
    },
    async (args: { projectName: string; target: "product" | "all_products" | "asset"; productName?: string; assetId?: string; includeLiterature?: boolean; confirm?: boolean }) => {
      try {
        const project = await findProject(args.projectName);
        const pslug = slugifyName(project.name);
        const withLit = args.includeLiterature !== false;
        type Item = { storageKey: string; folder: string; name: string; label: string };
        const items: Item[] = [];

        const addProduct = async (p: ProductRow) => {
          if (p.image_key) items.push({ storageKey: p.image_key, folder: `${pslug}/products`, name: p.slug, label: `${p.name} — photo` });
          const { data } = await db.from("project_assets").select("kind, title, storage_key, content_type, sort").eq("product_id", p.id).order("sort");
          for (const a of (data ?? []) as { kind: string; title: string; storage_key: string; content_type: string; sort: number }[]) {
            if (!a.content_type.startsWith("image/")) continue;
            if (a.kind === "product_image") items.push({ storageKey: a.storage_key, folder: `${pslug}/products`, name: `${p.slug}-${a.title}`, label: a.title });
            else if (a.kind === "presentation_page") items.push({ storageKey: a.storage_key, folder: `${pslug}/presentations`, name: `${p.slug}-${a.sort}-${a.title}`, label: a.title });
            else if (a.kind === "literature_page" && withLit) items.push({ storageKey: a.storage_key, folder: `${pslug}/literature`, name: `${p.slug}-p${a.sort}`, label: a.title });
          }
        };

        if (args.target === "product") {
          if (!args.productName) throw new Error("target=product needs productName.");
          await addProduct(await findProduct(project.id, args.productName));
        } else if (args.target === "all_products") {
          const { data } = await db.from("project_products").select("id, name, slug, category, content, image_key").eq("project_id", project.id).order("name");
          for (const p of (data ?? []) as ProductRow[]) await addProduct(p);
        } else {
          if (!args.assetId) throw new Error("target=asset needs assetId.");
          const { data } = await db.from("project_assets").select("title, storage_key, content_type, project_id").eq("id", args.assetId).maybeSingle();
          if (!data || data.project_id !== project.id) throw new Error("No such asset in this project.");
          if (!data.content_type.startsWith("image/")) throw new Error("Only images can be published.");
          items.push({ storageKey: data.storage_key, folder: `${pslug}/assets`, name: data.title, label: data.title });
        }
        if (items.length === 0) return ok("Nothing to publish (no images found for that target).");

        const already = await cdnUrlMap(items.map((i) => i.storageKey));
        const todo = items.filter((i) => !already.has(i.storageKey));
        if (!args.confirm) {
          return ok(`Would publish ${todo.length} image(s) (${items.length - todo.length} already public) of ${project.label} to the PUBLIC repo ${CDN_REPO}:\n${todo.slice(0, 20).map((i) => `- ${i.label} → ${i.folder}/`).join("\n")}${todo.length > 20 ? `\n…and ${todo.length - 20} more` : ""}\n\nThis is public and effectively permanent. Get the user's OK, then call again with confirm=true.`);
        }

        const batch = todo.slice(0, 8);
        const lines: string[] = [];
        for (const i of batch) {
          try {
            const r = await publishToCdn(i);
            lines.push(`✓ ${i.label}: ${r.cdn_url}`);
          } catch (e) {
            lines.push(`✗ ${i.label}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        const remaining = todo.length - batch.length;
        return ok(`${lines.join("\n")}\n\nRemaining: ${remaining}${remaining ? " — call kb_publish_to_cdn again (same arguments)." : ""}`, { published: batch.length, remaining });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_create_upload_link",
    {
      title: "Create A Browser Upload Link",
      description: `Use this when the user wants to add an image/file that lives in the chat or on their computer — you cannot pass the bytes of a chat-attached image to a tool. Returns a one-hour link the user opens in a browser to choose file(s); they are stored in the project's knowledge base with a permanent public URL. Afterwards call kb_list_assets with recent=true to get the URLs.

If the file already has a public https URL, use kb_add_asset with sourceUrl instead (no browser step).

Args: projectName, kind (product_image | reference_image | logo | document | presentation_page | other), title, productName (for product_image), notes (optional), makePrimary (optional — first file becomes the product's main photo).`,
      inputSchema: {
        projectName: z.string(),
        kind: z.enum(ASSET_KINDS),
        title: z.string().min(1).max(200),
        productName: z.string().optional(),
        notes: z.string().max(2000).optional(),
        makePrimary: z.boolean().optional(),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    async (args: { projectName: string; kind: (typeof ASSET_KINDS)[number]; title: string; productName?: string; notes?: string; makePrimary?: boolean }) => {
      try {
        const project = await findProject(args.projectName);
        const product = args.productName ? await findProduct(project.id, args.productName) : null;
        if (args.kind === "product_image" && !product) throw new Error("kind=product_image needs productName.");
        const token = signUploadToken({ p: project.id, k: args.kind, pr: product?.id ?? null, t: args.title, n: args.notes ?? null, m: args.makePrimary === true });
        const url = kbUploadUrl(token);
        return ok(`Upload link for ${project.label} (${args.kind}: "${args.title}"${product ? `, product ${product.name}` : ""}) — valid for 1 hour:\n${url}\n\nAsk the user to open it and choose the file(s), then call kb_list_assets with recent=true.`, { url });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_create_direct_upload",
    {
      title: "Upload Local Files Directly (sessions with a shell)",
      description: `For a session that can run shell commands (Claude Code, Cowork) with the files on that machine: stores them in the knowledge base with no browser and no base64. Returns one shell command per file — a curl PUT of the file to storage, then a curl POST to a finish URL that checks the bytes, registers the file (kind, title, product, main photo, page order) and prints JSON with its permanent public URL. Put the file's real local path, quoted, in place of FILE and run it. Links work for 30 minutes; repeating the finish step returns the same asset, never a copy.

Files: png/jpg/webp/gif or PDF, up to 25 MB each, up to 20 per call. Kinds: product_image (needs productName; makePrimary=true makes it the main photo), reference_image, logo, document, presentation_page, literature_page (brochure page images — sort = page number), literature_pdf, other. A file that only exists in the chat (no shell) needs kb_create_upload_link instead.

Args: projectName, files: [{ filename (with extension), kind, title, productName?, notes?, makePrimary?, sort? }].`,
      inputSchema: {
        projectName: z.string(),
        files: z
          .array(
            z.object({
              filename: z.string().min(1).max(200),
              kind: z.enum(DIRECT_KINDS),
              title: z.string().min(1).max(200),
              productName: z.string().optional(),
              notes: z.string().max(2000).optional(),
              makePrimary: z.boolean().optional(),
              sort: intLike.optional(),
            })
          )
          .min(1)
          .max(20),
      },
      annotations: { ...WRITE, idempotentHint: false },
    },
    async (args: {
      projectName: string;
      files: { filename: string; kind: (typeof DIRECT_KINDS)[number]; title: string; productName?: string; notes?: string; makePrimary?: boolean; sort?: number }[];
    }) => {
      try {
        const project = await findProject(args.projectName);
        // Validate everything first, so a bad entry doesn't leave half a batch.
        const plan = [];
        for (const f of args.files) {
          const product = f.productName ? await findProduct(project.id, f.productName) : null;
          if (f.kind === "product_image" && !product) throw new Error(`${f.filename}: kind=product_image needs productName.`);
          const ext = extname(f.filename).slice(1).toLowerCase();
          const type = DIRECT_TYPES[ext];
          if (!type) throw new Error(`${f.filename}: unsupported file type — use png, jpg, webp, gif or pdf.`);
          const imageOnly = f.kind !== "document" && f.kind !== "other" && f.kind !== "literature_pdf";
          if (imageOnly && type === "application/pdf") throw new Error(`${f.filename}: kind=${f.kind} must be an image.`);
          if (f.kind === "literature_pdf" && type !== "application/pdf") throw new Error(`${f.filename}: kind=literature_pdf must be a PDF.`);
          plan.push({ f, product, type });
        }
        const uploads = [];
        for (const { f, product, type } of plan) {
          const safe = f.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
          const key = `knowledge/${project.id}/uploads/${randomUUID()}-${safe}`;
          const putUrl = await presignUpload(key, type, undefined, DIRECT_TTL_SECONDS);
          const finishUrl = kbDirectFinishUrl(
            signDirectUploadToken(
              { p: project.id, key, k: f.kind, pr: product?.id ?? null, t: f.title, n: f.notes ?? null, m: f.makePrimary === true, ...(f.sort !== undefined ? { s: f.sort } : {}) },
              DIRECT_TTL_SECONDS
            )
          );
          const command = `curl -sSf -X PUT -H "Content-Type: ${type}" -T "FILE" "${putUrl}" && curl -sS -X POST "${finishUrl}"`;
          uploads.push({ filename: f.filename, kind: f.kind, title: f.title, product: product?.name ?? null, contentType: type, putUrl, finishUrl, command });
        }
        const lines = uploads.map(
          (u, i) => `${i + 1}. ${u.filename} → ${u.kind} "${u.title}"${u.product ? ` (${u.product})` : ""}\n${u.command}`
        );
        return ok(
          `Direct upload for ${project.label} — ${uploads.length} file(s), links valid 30 minutes. Run each command with FILE replaced by that file's quoted local path. Each prints JSON: ok, asset_id, url (permanent).\n\n${lines.join("\n\n")}`,
          { uploads }
        );
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_update_asset",
    {
      title: "Edit A Stored File's Details",
      description: `Changes a stored file's title, notes, page order, kind or product link, or makes a product photo the product's main photo. The file itself is untouched — to replace it, upload the new file and remove the old one with kb_delete_asset.

Notes are APPENDED by default so existing notes (e.g. "APPROVED by Shoaib") are kept; pass notesMode="replace" only when the user asks to rewrite them. makePrimary keeps the previous main photo as an extra product photo.

Args: assetId (uuid), title?, notes?, notesMode? ('append' | 'replace'), sort?, kind?, productName? (another product of the same project), makePrimary? (product photos only).`,
      inputSchema: {
        assetId: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        notesMode: z.enum(["append", "replace"]).optional(),
        sort: intLike.optional(),
        kind: z.enum(DIRECT_KINDS).optional(),
        productName: z.string().optional(),
        makePrimary: z.boolean().optional(),
      },
      annotations: WRITE,
    },
    async (args: { assetId: string; title?: string; notes?: string; notesMode?: "append" | "replace"; sort?: number; kind?: (typeof DIRECT_KINDS)[number]; productName?: string; makePrimary?: boolean }) => {
      try {
        const { data } = await db.from("project_assets").select("id, project_id, product_id, kind, title, storage_key, content_type, notes, sort").eq("id", args.assetId).maybeSingle();
        const asset = data as AssetRow | null;
        if (!asset) throw new Error(`No asset ${args.assetId}.`);
        const patch: Record<string, unknown> = {};
        if (args.title) patch.title = args.title;
        if (args.notes !== undefined) {
          patch.notes = args.notesMode === "replace" || !asset.notes ? args.notes : `${asset.notes}\n${args.notes}`;
          if (String(patch.notes).length > 4000) throw new Error("Notes would exceed 4000 characters — use notesMode=replace with a shorter text.");
        }
        if (args.sort !== undefined) patch.sort = args.sort;
        if (args.kind) {
          const pdf = asset.content_type === "application/pdf";
          if (pdf && !["document", "other", "literature_pdf"].includes(args.kind)) throw new Error(`This file is a PDF — kind=${args.kind} needs an image.`);
          if (!pdf && args.kind === "literature_pdf") throw new Error("kind=literature_pdf needs a PDF.");
          patch.kind = args.kind;
        }
        let productId = asset.product_id;
        if (args.productName) {
          productId = (await findProduct(asset.project_id, args.productName)).id;
          patch.product_id = productId;
        }
        const kind = (patch.kind as string | undefined) ?? asset.kind;
        if (args.makePrimary && (kind !== "product_image" || !productId)) throw new Error("makePrimary needs a product photo (kind=product_image) linked to a product.");
        if (Object.keys(patch).length) {
          const { error } = await db.from("project_assets").update(patch).eq("id", asset.id);
          if (error) throw new Error(error.message);
        }
        let primaryNote = "";
        if (args.makePrimary && productId) {
          const { data: product } = await db.from("project_products").select("name, image_key").eq("id", productId).maybeSingle();
          const old = product?.image_key as string | null | undefined;
          if (old && old !== asset.storage_key) {
            // Keep the previous main photo reachable as an extra photo.
            const { data: listed } = await db.from("project_assets").select("id").eq("storage_key", old).limit(1);
            if (!(listed ?? []).length) {
              await db.from("project_assets").insert({
                project_id: asset.project_id,
                product_id: productId,
                kind: "product_image",
                title: `${product?.name ?? "Product"} — previous main photo`,
                storage_key: old,
                content_type: old.endsWith(".png") ? "image/png" : old.endsWith(".webp") ? "image/webp" : "image/jpeg",
                notes: `Main photo until ${new Date().toISOString().slice(0, 10)}, replaced by "${(patch.title as string | undefined) ?? asset.title}".`,
              });
            }
          }
          const { error } = await db.from("project_products").update({ image_key: asset.storage_key, updated_at: new Date().toISOString() }).eq("id", productId);
          if (error) throw new Error(error.message);
          primaryNote = ` Now the main photo of ${product?.name ?? "the product"}${old && old !== asset.storage_key ? " (the previous one is kept as an extra photo)" : ""}.`;
        }
        if (!Object.keys(patch).length && !primaryNote) return ok("Nothing to change — pass at least one field.");
        return ok(`Updated "${(patch.title as string | undefined) ?? asset.title}"${Object.keys(patch).length ? ` (${Object.keys(patch).join(", ")})` : ""}.${primaryNote}`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_upsert_products",
    {
      title: "Create/Update Many Products",
      description: `Batch form of kb_upsert_product — up to 50 products in one call, same rules: each content is the product's EXACT manufacturer literature, never invented; same slug = update. Each product is reported separately, so one bad entry doesn't stop the rest.

Args: projectName, products: [{ name, slug?, category?, content (markdown), mode? ('replace' | 'append', default replace) }].`,
      inputSchema: {
        projectName: z.string(),
        products: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              slug: slugSchema.optional(),
              category: z.string().max(120).optional(),
              content: z.string().min(1),
              mode: z.enum(["replace", "append"]).optional(),
            })
          )
          .min(1)
          .max(50),
      },
      annotations: WRITE,
    },
    async ({ projectName, products }: { projectName: string; products: { name: string; slug?: string; category?: string; content: string; mode?: "replace" | "append" }[] }) => {
      try {
        const project = await findProject(projectName);
        const lines: string[] = [];
        let done = 0;
        for (const p of products) {
          const s = p.slug ?? slugify(p.name);
          try {
            const { data: existing } = await db.from("project_products").select("content, category").eq("project_id", project.id).eq("slug", s).maybeSingle();
            const merged = mergeContent(existing?.content, p.content, p.mode ?? "replace");
            const { error } = await db.from("project_products").upsert(
              { project_id: project.id, slug: s, name: p.name, category: p.category ?? existing?.category ?? null, content: merged, updated_at: new Date().toISOString() },
              { onConflict: "project_id,slug" }
            );
            if (error) throw new Error(error.message);
            lines.push(`✓ ${existing ? "Updated" : "Created"} ${p.name} (\`${s}\`)`);
            done++;
          } catch (e) {
            lines.push(`✗ ${p.name} (\`${s}\`): ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        return ok(`${project.label}: ${done}/${products.length} saved.\n${lines.join("\n")}`, { saved: done, total: products.length });
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_delete_asset",
    {
      title: "Delete An Asset",
      description: "Permanently deletes a stored file. Requires confirm=true.\n\nArgs: assetId (uuid), confirm.",
      inputSchema: { assetId: z.string().uuid(), confirm: confirmSchema },
      annotations: DELETE,
    },
    async ({ assetId, confirm }: { assetId: string; confirm?: boolean }) => {
      try {
        const { data } = await db.from("project_assets").select("id, title, storage_key").eq("id", assetId).maybeSingle();
        if (!data) throw new Error(`No asset ${assetId}.`);
        if (!confirm) return needConfirm(`the file "${data.title}"`);
        await db.from("project_products").update({ image_key: null }).eq("image_key", data.storage_key);
        const { error } = await db.from("project_assets").delete().eq("id", assetId);
        if (error) throw new Error(error.message);
        await safeDelete(data.storage_key);
        return ok(`Deleted "${data.title}".`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_upsert_global_rule",
    {
      title: "Create/Update A Global Rule",
      description: `Creates or updates a cross-brand rule/instruction that kb_get_brief returns first for EVERY project — e.g. how to use the knowledge, how to design images, tone/compliance rules, where NAP comes from. Same slug = update.

Args: slug, title (required when creating), content (markdown), mode ('replace' | 'append').`,
      inputSchema: { slug: slugSchema, title: z.string().min(1).max(200).optional(), content: z.string().min(1), mode: z.enum(["replace", "append"]).optional() },
      annotations: WRITE,
    },
    async ({ slug, title, content, mode }: { slug: string; title?: string; content: string; mode?: "replace" | "append" }) => {
      try {
        const { data: existing } = await db.from("kb_global_docs").select("title, content").eq("slug", slug).maybeSingle();
        const finalTitle = title ?? existing?.title;
        if (!finalTitle) throw new Error("title is required when creating a new rule.");
        const merged = mergeContent(existing?.content, content, mode ?? "replace");
        const { error } = await db.from("kb_global_docs").upsert({ slug, title: finalTitle, content: merged, updated_at: new Date().toISOString() }, { onConflict: "slug" });
        if (error) throw new Error(error.message);
        return ok(`${existing ? "Updated" : "Created"} global rule \`${slug}\`.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_delete_global_rule",
    {
      title: "Delete A Global Rule",
      description: "Permanently deletes a global rule. Requires confirm=true.\n\nArgs: slug, confirm.",
      inputSchema: { slug: slugSchema, confirm: confirmSchema },
      annotations: DELETE,
    },
    async ({ slug, confirm }: { slug: string; confirm?: boolean }) => {
      try {
        if (!confirm) return needConfirm(`the global rule "${slug}"`);
        const { data, error } = await db.from("kb_global_docs").delete().eq("slug", slug).select("slug");
        if (error) throw new Error(error.message);
        return ok((data ?? []).length ? `Deleted global rule \`${slug}\`.` : `No global rule \`${slug}\`.`);
      } catch (error) {
        return fail(error);
      }
    }
  );

  server.registerTool(
    "kb_add_memory",
    {
      title: "Add A Memory Note",
      description: `Appends a dated note to the knowledge base's running memory — a decision, preference, correction or fact worth remembering next time (e.g. "client wants Urdu captions", "never show competitor names"). With projectName it goes to that project's \`memory\` doc; without, to the global \`memory\` rule.

Args: note (string), projectName (optional).`,
      inputSchema: { note: z.string().min(1).max(2000), projectName: z.string().optional() },
      annotations: { ...WRITE, idempotentHint: false },
    },
    async ({ note, projectName }: { note: string; projectName?: string }) => {
      try {
        const line = `- ${new Date().toISOString().slice(0, 10)}: ${note.trim()}`;
        if (projectName) {
          const project = await findProject(projectName);
          const { data: existing } = await db.from("project_knowledge_docs").select("content").eq("project_id", project.id).eq("doc_type", "memory").eq("slug", "main").maybeSingle();
          const merged = mergeContent(existing?.content ?? "# Memory", line, "append");
          const { error } = await db.from("project_knowledge_docs").upsert(
            { project_id: project.id, doc_type: "memory", slug: "main", title: "Memory", content: merged, updated_at: new Date().toISOString() },
            { onConflict: "project_id,doc_type,slug" }
          );
          if (error) throw new Error(error.message);
          return ok(`Remembered for ${project.label}.`);
        }
        const { data: existing } = await db.from("kb_global_docs").select("content").eq("slug", "memory").maybeSingle();
        const merged = mergeContent(existing?.content ?? "# Global memory", line, "append");
        const { error } = await db.from("kb_global_docs").upsert({ slug: "memory", title: "Global memory", content: merged, updated_at: new Date().toISOString() }, { onConflict: "slug" });
        if (error) throw new Error(error.message);
        return ok("Remembered globally.");
      } catch (error) {
        return fail(error);
      }
    }
  );
}
