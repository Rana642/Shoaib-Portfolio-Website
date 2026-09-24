import sharp from "sharp";
import { verifyKbFile, sniff } from "@/lib/kb-files";
import { fetchObject, presignDownload, isStorageConfigured } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Public, signature-gated file endpoint for the knowledge base
 * (`/api/kb/file/<name>?k=<key>&sig=<hmac>`). The signature is minted only
 * by the MCP tools (lib/kb-files.ts), so URLs are unguessable and permanent —
 * safe to paste into Claude web artifacts/SVGs or ad tools. Optional
 * `w` (16–2400), `fmt` (jpg|png|webp) and `q` (40–95) return a smaller image.
 */

// Vercel serverless responses are capped at ~4.5 MB.
const MAX_DIRECT_BYTES = 4_000_000;
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = verifyKbFile(url.searchParams.get("k"), url.searchParams.get("sig"));
  if (!key || !isStorageConfigured) return new Response("Not found", { status: 404, headers: HEADERS });

  let file: { buffer: Buffer; contentType: string };
  try {
    file = await fetchObject(key);
  } catch {
    return new Response("Not found", { status: 404, headers: HEADERS });
  }

  const detected = sniff(file.buffer);
  const mime = detected?.mime ?? file.contentType;
  const cache = "public, max-age=31536000, s-maxage=31536000, immutable";
  const name = decodeURIComponent(url.pathname.split("/").pop() ?? "file").replace(/["\r\n]/g, "");

  if (mime === "application/pdf") {
    if (file.buffer.length > MAX_DIRECT_BYTES) {
      return Response.redirect(await presignDownload(key, undefined, 6 * 3600), 302);
    }
    return new Response(new Uint8Array(file.buffer), {
      headers: { ...HEADERS, "Content-Type": mime, "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": cache },
    });
  }

  if (!mime.startsWith("image/")) return new Response("Unsupported file", { status: 415, headers: HEADERS });

  const width = Number(url.searchParams.get("w")) || 0;
  const fmtParam = url.searchParams.get("fmt");
  const quality = Math.min(95, Math.max(40, Number(url.searchParams.get("q")) || 85));
  const needsSizeCap = file.buffer.length > MAX_DIRECT_BYTES;
  if (!width && !fmtParam && !needsSizeCap) {
    return new Response(new Uint8Array(file.buffer), {
      headers: { ...HEADERS, "Content-Type": mime, "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": cache },
    });
  }

  const fmt = fmtParam === "png" || fmtParam === "webp" || fmtParam === "jpg" ? fmtParam : needsSizeCap ? "jpg" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  try {
    let img = sharp(file.buffer).rotate().resize({ width: Math.min(2400, Math.max(16, width || 2400)), withoutEnlargement: true });
    if (fmt === "jpg") img = img.flatten({ background: "#ffffff" }).jpeg({ quality });
    else if (fmt === "webp") img = img.webp({ quality });
    else img = img.png();
    const out = await img.toBuffer();
    return new Response(new Uint8Array(out), {
      headers: { ...HEADERS, "Content-Type": `image/${fmt === "jpg" ? "jpeg" : fmt}`, "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": cache },
    });
  } catch {
    return new Response("Could not process image", { status: 422, headers: HEADERS });
  }
}
