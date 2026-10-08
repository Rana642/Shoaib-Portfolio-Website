import { NextResponse } from "next/server";
import { ingestWebhook, validSignature, verifyTokenFrom, whatsappCredential } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

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
  const cred = await whatsappCredential().catch(() => null);
  if (!cred || !validSignature(raw, request.headers.get("x-hub-signature-256"), cred.app_secret)) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    await ingestWebhook(JSON.parse(raw));
  } catch (error) {
    // Still 200: Meta retries failed deliveries for days, and a bad payload
    // would just loop. The error is in the Vercel logs.
    console.error("[whatsapp-webhook]", error);
  }
  return NextResponse.json({ ok: true });
}
