import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/dashboard/db";
import { verifyPlannerUploadToken } from "@/lib/kb-files";
import { deleteObject, isStorageConfigured, presignUpload } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { addPlannerPost, loadStoredMedia, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, pktWhen } from "@/lib/planner-intake";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Backs the planner upload page (/planner-upload/<token>), the fallback for a
 * chat that can't pass a file to social_add_post. The token (social_create_upload_link)
 * is the only credential: it fixes the project and the post settings, expires
 * in an hour and can only write under `social/<projectId>/`. Browser → R2
 * directly ("presign"), then one "complete" call per file, which runs the same
 * checks as social_add_post and puts it on the planner.
 */

const MAX_FILES = 10;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);

type FileMeta = { name?: string; type?: string; size?: number; key?: string; index?: number; count?: number };

export async function POST(request: Request) {
  if (!isStorageConfigured) return NextResponse.json({ error: "File upload isn't configured." }, { status: 503 });

  let body: { token?: string; action?: string; files?: FileMeta[]; file?: FileMeta };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = verifyPlannerUploadToken(String(body.token ?? ""));
  if (!token) return NextResponse.json({ error: "This upload link is invalid or has expired. Ask the chat for a new one." }, { status: 401 });
  if (!(await rateLimit(`plup:${clientIp(request)}:${token.p}`, 60, 600))) {
    return NextResponse.json({ error: "Too many uploads. Please wait a moment." }, { status: 429 });
  }
  // Only files this page put up ("link-"), never another post's picture.
  const prefix = `social/${token.p}/link-`;

  if (body.action === "presign") {
    const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
    if (files.length === 0) return NextResponse.json({ error: "No files." }, { status: 400 });
    try {
      const out = [];
      for (const f of files) {
        const type = String(f.type ?? "");
        const size = Number(f.size ?? 0);
        if (!f.name || !TYPES.has(type)) return NextResponse.json({ error: `"${f.name ?? "file"}" isn't a JPG/PNG/WebP picture or MP4/MOV video.` }, { status: 415 });
        const max = type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
        if (size <= 0 || size > max) return NextResponse.json({ error: `"${f.name}" is too big (pictures 25 MB, videos 100 MB).` }, { status: 413 });
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
        const key = `${prefix}${randomUUID()}-${safe}`; // social/<project>/link-<uuid>-<name>
        out.push({ name: f.name, key, type, url: await presignUpload(key, type, size) });
      }
      return NextResponse.json({ uploads: out });
    } catch {
      return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
    }
  }

  if (body.action === "complete") {
    const f = body.file ?? {};
    const name = String(f.name ?? "file").slice(0, 200);
    const key = String(f.key ?? "");
    if (!key.startsWith(prefix) || key.includes("..")) return NextResponse.json({ name, ok: false, error: "Invalid file reference." });
    // The link's date, time and caption belong to one file; more files get a free day each.
    const single = Number(f.count ?? 1) <= 1;
    const first = Number(f.index ?? 0) === 0;
    try {
      const media = await loadStoredMedia(key, name);
      const r = await addPlannerPost({
        projectId: token.p,
        media,
        date: first ? token.d ?? null : null,
        time: first ? token.t ?? null : null,
        platforms: token.pl ?? null,
        postType: token.k ?? null,
        caption: single ? token.c ?? null : null,
      });
      const where = r.platforms.length ? r.platforms.join(", ") : "no platform connected yet";
      const state = r.status === "scheduled" ? `Scheduled for ${pktWhen(r.scheduledAt)} on ${where}.` : `On the planner for ${pktWhen(r.scheduledAt)}, waiting for a caption.`;
      const fixes = r.fixes.map((x) => x.en);
      return NextResponse.json({ name, ok: true, text: [state, ...fixes.map((x) => `Fix: ${x}`)].join(" ") });
    } catch (e) {
      // A file no post points to is removed, so a refused upload leaves nothing behind.
      const { count } = await db.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("media_key", key);
      if (!count) await deleteObject(key).catch(() => undefined);
      const message = e instanceof Error ? e.message : "";
      return NextResponse.json({ name, ok: false, error: /does not exist|NoSuchKey/i.test(message) ? "The file didn't finish uploading. Please try again." : message || "Upload failed." });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
