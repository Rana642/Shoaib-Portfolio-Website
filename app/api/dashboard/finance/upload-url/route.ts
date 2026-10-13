import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { isStorageConfigured, presignUpload } from "@/lib/storage";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/finance";

/**
 * Presigned PUT for a receipt / bill photo attached to a Finance entry —
 * admin only, straight to private storage under finance/. The size is baked
 * into the signature, so a bigger body is refused.
 */
export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isStorageConfigured) return NextResponse.json({ error: "File upload isn't configured yet." }, { status: 503 });

  let body: { name?: string; type?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  if (!name) return NextResponse.json({ error: "Missing file name." }, { status: 400 });
  if (!RECEIPT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Attach a photo (JPG, PNG, WebP, HEIC) or a PDF." }, { status: 415 });
  }
  if (!size || size > RECEIPT_MAX_BYTES) return NextResponse.json({ error: "The file must be under 10 MB." }, { status: 413 });

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const key = `finance/${crypto.randomUUID()}-${safeName}`;
  try {
    return NextResponse.json({ url: await presignUpload(key, type, size), key });
  } catch {
    return NextResponse.json({ error: "Couldn't prepare the upload." }, { status: 500 });
  }
}
