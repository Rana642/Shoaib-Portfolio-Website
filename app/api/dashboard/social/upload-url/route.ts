import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { isStorageConfigured, presignUpload } from "@/lib/storage";

/**
 * Presigned PUT for the /dashboard/social upload queue — authed (not
 * token-gated like the public intake upload), namespaced per client.
 */
export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isStorageConfigured) {
    return NextResponse.json({ error: "File upload isn't configured yet." }, { status: 503 });
  }

  let body: { name?: string; type?: string; size?: number; projectId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "application/octet-stream");
  const size = Number(body.size ?? 0);
  const projectId = String(body.projectId ?? "").trim();
  if (!name || !projectId) return NextResponse.json({ error: "Missing file name or project." }, { status: 400 });
  // Reels are videos (MP4/MOV); everything else is an image.
  const isVideo = type === "video/mp4" || type === "video/quicktime";
  if (type.startsWith("video/") && !isVideo) {
    return NextResponse.json({ error: "Reels must be MP4 or MOV videos." }, { status: 415 });
  }
  if (isVideo ? size > 300 * 1024 * 1024 : size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: isVideo ? "Videos must be under 300 MB." : "Each image must be under 25 MB." }, { status: 413 });
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
