import { NextResponse } from "next/server";
import { isStorageConfigured, presignUpload } from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/payment-accounts";
import { payableInvoice, receiptPrefix } from "@/lib/payment-receipts";

/**
 * Public: a short-lived presigned PUT for one payment-receipt file, so the
 * browser uploads straight to private storage. Scoped to an open invoice
 * (its link token) or to the general /pay page. Images or PDF, ≤ 10 MB —
 * the size is baked into the signature so a bigger body is refused.
 */
export async function POST(request: Request) {
  if (!isStorageConfigured) {
    return NextResponse.json({ error: "Receipt upload isn't available right now. Please send it on WhatsApp." }, { status: 503 });
  }
  if (!(await rateLimit(`payup:${clientIp(request)}`, 12, 600))) {
    return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  }

  let body: { token?: string; name?: string; type?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  if (token) {
    const found = await payableInvoice(token);
    if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  }

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const size = Number(body.size ?? 0);
  if (!name) return NextResponse.json({ error: "Missing file name." }, { status: 400 });
  if (!RECEIPT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Please upload a photo (JPG, PNG, WebP, HEIC) or a PDF." }, { status: 415 });
  }
  if (!size || size > RECEIPT_MAX_BYTES) {
    return NextResponse.json({ error: "The receipt must be under 10 MB." }, { status: 413 });
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const key = `${receiptPrefix(token || "pay")}${crypto.randomUUID()}-${safeName}`;
  try {
    const url = await presignUpload(key, type, size);
    return NextResponse.json({ url, key });
  } catch {
    return NextResponse.json({ error: "Couldn't prepare the upload. Please try again." }, { status: 500 });
  }
}
