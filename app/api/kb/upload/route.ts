import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyUploadToken, sniff, registerAsset } from "@/lib/kb-files";
import { isStorageConfigured, presignUpload, fetchObject, deleteObject } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Backs the knowledge-base upload page (/kb-upload/<token>). The token — minted
 * by the kb_create_upload_link MCP tool — is the only credential: it fixes the
 * project/kind/product, expires in an hour and can only write under
 * `knowledge/<projectId>/uploads/`. Two steps so big photos go browser → R2
 * directly (Vercel bodies are capped at ~4.5 MB): "presign" then "complete".
 */

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;
const IMAGE_KINDS = new Set(["product_image", "reference_image", "logo"]);

type FileMeta = { name?: string; type?: string; size?: number; key?: string };

export async function POST(request: Request) {
  if (!isStorageConfigured) return NextResponse.json({ error: "File upload isn't configured." }, { status: 503 });

  let body: { token?: string; action?: string; files?: FileMeta[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = verifyUploadToken(String(body.token ?? ""));
  if (!token) return NextResponse.json({ error: "This upload link is invalid or has expired. Ask Claude for a new one." }, { status: 401 });
  if (!(await rateLimit(`kbup:${clientIp(request)}:${token.p}`, 60, 600))) {
    return NextResponse.json({ error: "Too many uploads. Please wait a moment." }, { status: 429 });
  }
  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  if (files.length === 0) return NextResponse.json({ error: "No files." }, { status: 400 });
  const prefix = `knowledge/${token.p}/uploads/`;

  if (body.action === "presign") {
    try {
      const out = [];
      for (const f of files) {
        const size = Number(f.size ?? 0);
        if (!f.name || size <= 0 || size > MAX_FILE_BYTES) {
          return NextResponse.json({ error: `"${f.name ?? "file"}" must be between 1 byte and 25 MB.` }, { status: 413 });
        }
        const type = String(f.type || "application/octet-stream");
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        const key = `${prefix}${randomUUID()}-${safe}`;
        out.push({ name: f.name, key, type, url: await presignUpload(key, type, size) });
      }
      return NextResponse.json({ uploads: out });
    } catch {
      return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
    }
  }

  if (body.action === "complete") {
    const results: { name: string; ok: boolean; url?: string; id?: string; title?: string; error?: string }[] = [];
    let first = true;
    for (const f of files) {
      const name = String(f.name ?? "file");
      const key = String(f.key ?? "");
      if (!key.startsWith(prefix) || key.includes("..")) {
        results.push({ name, ok: false, error: "Invalid file reference." });
        continue;
      }
      try {
        const { buffer } = await fetchObject(key);
        const type = buffer.length <= MAX_FILE_BYTES ? sniff(buffer) : null;
        if (!type || (IMAGE_KINDS.has(token.k) && !type.mime.startsWith("image/"))) {
          await deleteObject(key).catch(() => undefined);
          results.push({ name, ok: false, error: IMAGE_KINDS.has(token.k) ? "Not a supported image (png/jpg/webp/gif)." : "Not a supported file (image or PDF)." });
          continue;
        }
        const title = files.length === 1 ? token.t : `${token.t} — ${name.replace(/\.[^.]+$/, "")}`;
        const asset = await registerAsset({
          projectId: token.p,
          productId: token.pr ?? null,
          kind: token.k,
          title,
          key,
          contentType: type.mime,
          notes: token.n ?? null,
          makePrimary: first && token.m === true,
        });
        first = false;
        results.push({ name, ok: true, url: asset.url, id: asset.id, title });
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        results.push({ name, ok: false, error: /does not exist|NoSuchKey/i.test(message) ? "The file didn't finish uploading — please try again." : message || "Upload failed." });
      }
    }
    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
