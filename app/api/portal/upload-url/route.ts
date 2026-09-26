import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, getPortalUser } from "@/lib/portal/auth";
import { isStorageConfigured, presignUpload } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

// The publishing pipeline takes these; same limit as the dashboard Planner.
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Presigned PUT for a client-portal graphic upload. Only for a signed-in
 * portal user with the "uploads" feature, into one of their own projects'
 * folders — the same social/<project>/ namespace the dashboard Planner
 * uses, so the file publishes exactly like one Shoaib uploaded.
 */
export async function POST(request: Request) {
  const ctx = await getPortalUser();
  if (!ctx) return NextResponse.json({ error: "Your session has ended — sign in again." }, { status: 401 });
  if (!can(ctx, "uploads")) return NextResponse.json({ error: "Uploading isn't switched on for you." }, { status: 403 });
  if (!isStorageConfigured) return NextResponse.json({ error: "Uploads aren't available right now." }, { status: 503 });

  let body: { name?: string; type?: string; size?: number; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  const projectId = String(body.projectId ?? "");

  if (!name || !/^[0-9a-f-]{36}$/i.test(projectId)) return NextResponse.json({ error: "Missing file name or project." }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ error: "Please upload JPG, PNG or WebP images." }, { status: 415 });
  if (!(size > 0) || size > MAX_BYTES) return NextResponse.json({ error: "Each image must be under 25 MB." }, { status: 413 });

  const { data: project } = await db.from("client_projects").select("id").eq("id", projectId).eq("client_id", ctx.clientId).maybeSingle();
  if (!project || !canSeeProject(ctx, projectId)) return NextResponse.json({ error: "That project isn't one of yours." }, { status: 403 });

  if (!(await rateLimit(`portal-upload:${ctx.user.id}`, 100, 3600))) {
    return NextResponse.json({ error: "That's a lot of uploads in an hour — try again a little later." }, { status: 429 });
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  const key = `social/${projectId}/${crypto.randomUUID()}-${safeName}`;
  try {
    const url = await presignUpload(key, type, size);
    return NextResponse.json({ url, key });
  } catch {
    return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
  }
}
