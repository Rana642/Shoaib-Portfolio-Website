import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./dashboard/db";
import { deleteObject } from "./storage";

/**
 * Stable public URLs + upload links for the knowledge base's stored files.
 *
 * Why: Claude web sees MCP image blocks but gets no bytes/URL it can reuse in
 * its own SVG/artifact output, and it can't hand a chat-attached image to a
 * tool as bytes. So (1) every stored file gets a signed, unguessable, permanent
 * URL that serves the file (with optional ?w=&fmt= resizing), and (2) an
 * upload link lets Shoaib drop files from the browser straight into a
 * project's knowledge base. Signatures use MCP_OAUTH_SIGNING_KEY with a
 * per-purpose prefix (domain separation), so a file signature can't be reused
 * as an upload token or vice-versa.
 */

const SITE = "https://adsbyshoaib.com";
const secret = process.env.MCP_OAUTH_SIGNING_KEY || "";

export const KB_KEY_PREFIX = "knowledge/";

function sign(domain: string, data: string): string {
  if (!secret) throw new Error("MCP_OAUTH_SIGNING_KEY is not configured.");
  return createHmac("sha256", secret).update(`${domain}:${data}`).digest("base64url");
}
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Detects png/jpeg/webp/gif/pdf from the bytes — never trust a declared type. */
export function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: "png" };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
    if (buf.toString("ascii", 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
    if (buf.toString("ascii", 0, 4) === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  }
  return null;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

/** Permanent public URL for a stored file. Append `&w=800&fmt=jpg` (w ≤ 2400,
 *  fmt jpg|png|webp, q 40–95) to get a smaller rendition of an image. */
export function kbFileUrl(key: string, title?: string): string {
  const ext = key.includes(".") ? key.split(".").pop()!.toLowerCase() : "bin";
  const name = `${slugify(title ?? key.split("/").pop()!.replace(/\.[^.]+$/, ""))}.${ext}`;
  return `${SITE}/api/kb/file/${encodeURIComponent(name)}?k=${Buffer.from(key).toString("base64url")}&sig=${sign("kb-file", key)}`;
}

/** Returns the storage key if the signature matches (and it's a knowledge-base key), else null. */
export function verifyKbFile(k: string | null, sig: string | null): string | null {
  if (!k || !sig || !secret) return null;
  try {
    const key = Buffer.from(k, "base64url").toString("utf8");
    if (!key.startsWith(KB_KEY_PREFIX) || key.includes("..")) return null;
    return safeEqual(sig, sign("kb-file", key)) ? key : null;
  } catch {
    return null;
  }
}

// ── upload links ──────────────────────────────────────────────────

export type UploadTokenPayload = {
  p: string; // project id
  k: string; // asset kind
  pr?: string | null; // product id
  t: string; // title
  n?: string | null; // notes
  m?: boolean; // make primary product photo
  e: number; // expiry (unix seconds)
};

export function signUploadToken(payload: Omit<UploadTokenPayload, "e">, ttlSeconds = 3600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${sign("kb-upload", body)}`;
}

export function verifyUploadToken(token: string): UploadTokenPayload | null {
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign("kb-upload", body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadTokenPayload;
    return payload.e >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}

export const kbUploadUrl = (token: string) => `${SITE}/kb-upload/${token}`;

// ── asset rows ────────────────────────────────────────────────────

async function safeDelete(key: string | null | undefined) {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch {
    // Best-effort cleanup.
  }
}

/** Records an already-stored file as a project asset (and optionally the
 *  product's primary photo). On failure the stored object is removed. */
export async function registerAsset(input: {
  projectId: string;
  productId?: string | null;
  kind: string;
  title: string;
  key: string;
  contentType: string;
  notes?: string | null;
  makePrimary?: boolean;
}): Promise<{ id: string; url: string; primary: boolean }> {
  const { data, error } = await db
    .from("project_assets")
    .insert({
      project_id: input.projectId,
      product_id: input.productId ?? null,
      kind: input.kind,
      title: input.title,
      storage_key: input.key,
      content_type: input.contentType,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) {
    await safeDelete(input.key);
    throw new Error(error.message);
  }
  let primary = false;
  if (input.kind === "product_image" && input.productId) {
    const { data: product } = await db.from("project_products").select("image_key").eq("id", input.productId).maybeSingle();
    if (input.makePrimary || !product?.image_key) {
      const { error: upErr } = await db.from("project_products").update({ image_key: input.key, updated_at: new Date().toISOString() }).eq("id", input.productId);
      if (upErr) throw new Error(upErr.message);
      if (product?.image_key && product.image_key !== input.key) await safeDelete(product.image_key);
      primary = true;
    }
  }
  return { id: data.id as string, url: kbFileUrl(input.key, input.title), primary };
}
