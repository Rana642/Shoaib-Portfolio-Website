import { after, NextResponse } from "next/server";
import { ingestWebhook, validSignature, verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Meta sends account_update (a business connecting or disconnecting) to the app-wide callback,
// which is this route, even for numbers connected through Socially Snap; seen 7 Nov 2026.
// Socially Snap shares this Meta app, so the body goes on byte for byte with Meta's own
// signature, and Socially Snap checks that signature itself.
const SOCIALLY_SNAP_WEBHOOK = "https://api.sociallysnap.app/v1/meta/webhook";

function hasAccountUpdate(payload: { entry?: { changes?: { field?: string }[] }[] }): boolean {
  return (payload.entry ?? []).some((entry) => (entry.changes ?? []).some((change) => change.field === "account_update"));
}

async function forwardToSociallySnap(raw: string, signature: string): Promise<void> {
  try {
    const response = await fetch(SOCIALLY_SNAP_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: raw,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) console.error("[whatsapp-webhook] Socially Snap forward failed", response.status);
  } catch (error) {
    console.error("[whatsapp-webhook] Socially Snap forward failed", error);
  }
}

/** Meta's one-time subscription check: echo hub.challenge if the token matches. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const cred = await whatsappCredential().catch(() => null);
  if (
    cred &&
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === verifyTokenFrom(cred.app_secret)
  ) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Messages, echoes and statuses. Signed with the app secret; always 200 fast. */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const cred = await whatsappCredential().catch(() => null);
  if (!cred || !signature || !validSignature(raw, signature, cred.app_secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const payload = JSON.parse(raw);
    if (hasAccountUpdate(payload)) after(() => forwardToSociallySnap(raw, signature));
    await ingestWebhook(payload);
  } catch (error) {
    // Still 200: Meta retries failed deliveries for days, and a bad payload
    // would just loop. The error is in the Vercel logs.
    console.error("[whatsapp-webhook]", error);
  }
  return NextResponse.json({ ok: true });
}
