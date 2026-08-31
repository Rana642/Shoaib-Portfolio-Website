import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { isStorageConfigured, presignUpload } from "@/lib/storage";

/**
 * Public endpoint the intake form calls to get a short-lived presigned PUT
 * URL, so the client uploads brand assets straight to object storage.
 * Gated by a valid, still-pending intake token — not by login.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!isStorageConfigured) {
    return NextResponse.json({ error: "File upload isn't configured yet." }, { status: 503 });
  }

  const { token } = await ctx.params;

  const { data: intake } = await db
    .from("client_intakes")
    .select("id, status")
    .eq("access_token", token)
    .maybeSingle();

  if (!intake) return NextResponse.json({ error: "Invalid link." }, { status: 404 });
  if (intake.status === "submitted") {
    return NextResponse.json({ error: "This form is already submitted." }, { status: 409 });
  }

  let body: { name?: string; type?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "application/octet-stream");
  const size = Number(body.size ?? 0);
  if (!name) return NextResponse.json({ error: "Missing file name." }, { status: 400 });
  // 50 MB per file — generous for logos, brand PDFs, and short clips.
  if (size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Each file must be under 50 MB." }, { status: 413 });
  }

  // Namespace by token, and strip anything risky from the client's filename.
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const key = `intakes/${token}/${crypto.randomUUID()}-${safeName}`;

  try {
    const url = await presignUpload(key, type);
    return NextResponse.json({ url, key });
  } catch {
    return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
  }
}
