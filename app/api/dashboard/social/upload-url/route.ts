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
  if (size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Each image must be under 25 MB." }, { status: 413 });
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
