import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { kbFileUrl, registerAsset, sniff, verifyDirectUploadToken } from "@/lib/kb-files";
import { deleteObject, fetchObject, headObject, isStorageConfigured, uploadObject } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Finish step of a direct upload (kb_create_direct_upload MCP tool): a
 * Claude session with a shell PUTs the file to the presigned storage URL,
 * then POSTs here with the signed token. The token fixes project, kind,
 * title and product and only ever points at its own upload key; this checks
 * the bytes (type + size), moves the file to its permanent key and registers
 * the asset. Repeating the call returns the same asset instead of a copy.
 */

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IMAGE_KINDS = new Set(["product_image", "reference_image", "logo", "presentation_page", "literature_page"]);

export async function POST(request: Request) {
  if (!isStorageConfigured) return NextResponse.json({ ok: false, error: "File storage isn't configured." }, { status: 503 });
  const token = verifyDirectUploadToken(new URL(request.url).searchParams.get("t") ?? "");
  if (!token) return NextResponse.json({ ok: false, error: "This upload link is invalid or has expired — create a new one with kb_create_direct_upload." }, { status: 401 });
  if (!(await rateLimit(`kbdirect:${clientIp(request)}:${token.p}`, 120, 600))) {
    return NextResponse.json({ ok: false, error: "Too many uploads. Wait a moment and run the finish step again." }, { status: 429 });
  }

  // The permanent key reuses the upload's uuid, so a second call finds it.
  const id = token.key.slice(token.key.lastIndexOf("/") + 1).slice(0, 36);
  const { data: done } = await db
    .from("project_assets")
    .select("id, title, storage_key")
    .eq("project_id", token.p)
    .like("storage_key", `knowledge/${token.p}/assets/${id}.%`)
    .limit(1);
  const existing = (done ?? [])[0] as { id: string; title: string; storage_key: string } | undefined;
  if (existing) return NextResponse.json({ ok: true, already: true, asset_id: existing.id, title: existing.title, url: kbFileUrl(existing.storage_key, existing.title) });

  try {
    const head = await headObject(token.key);
    if (!head) return NextResponse.json({ ok: false, error: "Nothing uploaded yet — run the PUT part of the command (curl -T) first." }, { status: 404 });
    if (head.size <= 0 || head.size > MAX_FILE_BYTES) {
      await deleteObject(token.key).catch(() => undefined);
      return NextResponse.json({ ok: false, error: "Files must be between 1 byte and 25 MB." }, { status: 413 });
    }
    const { buffer } = await fetchObject(token.key);
    const type = sniff(buffer);
    const wrongKind =
      !type ||
      (IMAGE_KINDS.has(token.k) && !type.mime.startsWith("image/")) ||
      (token.k === "literature_pdf" && type.mime !== "application/pdf");
    if (wrongKind) {
      await deleteObject(token.key).catch(() => undefined);
      const want = IMAGE_KINDS.has(token.k) ? "an image (png/jpg/webp/gif)" : token.k === "literature_pdf" ? "a PDF" : "an image or a PDF";
      return NextResponse.json({ ok: false, error: `kind=${token.k} needs ${want}; the uploaded bytes are ${type?.mime ?? "an unsupported type"}.` }, { status: 415 });
    }
    const key = `knowledge/${token.p}/assets/${id}.${type.ext}`;
    await uploadObject(key, buffer, type.mime);
    await deleteObject(token.key).catch(() => undefined);
    const asset = await registerAsset({
      projectId: token.p,
      productId: token.pr ?? null,
      kind: token.k,
      title: token.t,
      key,
      contentType: type.mime,
      notes: token.n ?? null,
      makePrimary: token.m === true,
      sort: token.s,
    });
    return NextResponse.json({ ok: true, asset_id: asset.id, title: token.t, kind: token.k, url: asset.url, primary: asset.primary, bytes: buffer.length, type: type.mime });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Upload failed." }, { status: 500 });
  }
}
