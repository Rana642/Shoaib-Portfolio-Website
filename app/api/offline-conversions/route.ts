import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { uploadClickConversions } from "@/lib/google-ads-client";

// Receives an admin-confirmed hotel booking from a client site and uploads it
// to Google Ads as an offline click conversion (keyed by gclid + order_id).
// Auth: shared secret in the x-offline-secret header (env OFFLINE_CONVERSIONS_SECRET).

type Body = {
  customerId: string;          // Google Ads account, e.g. "622-325-0696"
  loginCustomerId?: string;    // MCC, e.g. "885-934-7478"
  conversionActionId: string;  // numeric id of the Google Ads conversion action
  gclid: string;
  orderId: string;             // booking reference — same one the thank-you page sends
  conversionDateTime: string;  // "YYYY-MM-DD HH:MM:SS+05:00"
  value: number;
  currency: string;            // "PKR"
  email?: string | null;
  phone?: string | null;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function secretOk(received: string | null): boolean {
  const expected = process.env.OFFLINE_CONVERSIONS_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-offline-secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const { customerId, conversionActionId, gclid, orderId, conversionDateTime, value, currency } = body;
  if (!customerId || !conversionActionId || !gclid || !orderId || !conversionDateTime || !(value > 0) || !currency) {
    return NextResponse.json({ ok: false, error: "missing or invalid fields" }, { status: 400 });
  }

  const customerDigits = customerId.replace(/-/g, "");
  const conversion: Record<string, unknown> = {
    gclid,
    conversionAction: `customers/${customerDigits}/conversionActions/${conversionActionId}`,
    conversionDateTime,
    conversionValue: value,
    currencyCode: currency,
    orderId,
  };

  // Enhanced conversions: send hashed identifiers only (Google's normalisation rules).
  const userIdentifiers: Array<Record<string, string>> = [];
  if (body.email) userIdentifiers.push({ hashedEmail: sha256(body.email.trim().toLowerCase()) });
  if (body.phone) {
    const digits = body.phone.replace(/[^0-9]/g, "");
    if (digits) userIdentifiers.push({ hashedPhoneNumber: sha256(`+${digits}`) });
  }
  if (userIdentifiers.length) conversion.userIdentifiers = userIdentifiers;

  try {
    const result = (await uploadClickConversions(customerId, [conversion], body.loginCustomerId)) as {
      partialFailureError?: unknown;
      results?: unknown[];
    };
    if (result?.partialFailureError) {
      return NextResponse.json({ ok: false, error: "google rejected the conversion", detail: result.partialFailureError }, { status: 422 });
    }
    return NextResponse.json({ ok: true, orderId, results: result?.results ?? [] });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "upload failed" }, { status: 502 });
  }
}
