import { handleSociallySnapEvent } from "@/lib/socially-snap/inbound";
import { ingestWebhook } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Receiver for Socially Snap's signed events (docs/specs/phase-5-cutover.md in the platform repo).
 * With WHATSAPP_VIA_SOCIALLY_SNAP=live the event is stored in the inbox like a Meta delivery;
 * in any other mode it is only logged (event type and counts, never what a person wrote).
 * Separate from /api/whatsapp/webhook, Meta's own callback.
 */
export async function POST(request: Request) {
  const result = await handleSociallySnapEvent(await request.text(), request.headers.get("x-sociallysnap-signature"), {
    env: process.env,
    // The value is Meta's own, passed on whole and signed by the platform; ingestWebhook reads it defensively.
    ingest: (payload) => ingestWebhook(payload as Parameters<typeof ingestWebhook>[0], { fromPlatform: true }),
    log: (line, data) => console.log("[sociallysnap-events]", line, JSON.stringify(data)),
  });
  return Response.json(result.body, { status: result.status });
}
