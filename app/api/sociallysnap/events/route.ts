import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Our own receiver for Socially Snap's signed events (Shoaib, 2026-11-10), so a
 * workspace with a real number never sends its chats to a third party. It checks
 * X-SociallySnap-Signature (t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">, several
 * v1 values while a secret rotates) against SOCIALLYSNAP_WEBHOOK_SECRET and logs ONLY
 * the event type and ids: never message text, names or phone numbers. Meta's message ids
 * (wamid) carry the customer's number in their base64, so they are logged only as a short hash.
 * Separate from /api/whatsapp/webhook (the live +92 311 inbox), which it never touches.
 */

const TAG = "[sociallysnap-events]";
const TOLERANCE_SECONDS = 300;
const MAX_ITEMS = 20;

function validSignature(body: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const pair of header.split(",")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (name === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    if (name === "v1" && /^[0-9a-f]{64}$/.test(value) && signatures.length < 5) signatures.push(value);
  }
  if (timestamp === undefined || signatures.length === 0 || Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return signatures.some((signature) => timingSafeEqual(expected, Buffer.from(signature, "hex")));
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS).map(obj) : []);
const str = (v: unknown): string | undefined => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 200) : undefined);
// Same wamid, same hash, so a message's statuses can still be matched up.
const wamidHash = (v: unknown): string | undefined => {
  const id = str(v);
  return id ? `wamid#${createHash("sha256").update(id).digest("hex").slice(0, 12)}` : undefined;
};

/** Ids, types, statuses and error codes only — the parts needed to test, nothing a person wrote. */
function summarize(value: unknown): Obj {
  const v = obj(value);
  const out: Obj = {};
  const messages = list(v.messages);
  if (messages.length) {
    out.messages = messages.map((m) => {
      const type = str(m.type) ?? "";
      const part = obj(m[type]);
      // Media messages carry an id the developer downloads with GET /v1/media/{id}/download.
      return { id: wamidHash(m.id), type, ...(str(part.id) ? { media_id: str(part.id), mime_type: str(part.mime_type) } : {}) };
    });
  }
  const statuses = list(v.statuses);
  if (statuses.length) {
    out.statuses = statuses.map((s) => {
      const pricing = obj(s.pricing);
      const errors = list(s.errors).map((e) => e.code).filter((c) => c !== undefined);
      return { id: wamidHash(s.id), status: str(s.status), ...(errors.length ? { errors } : {}), ...(pricing.billable !== undefined ? { billable: pricing.billable, category: str(pricing.category) } : {}) };
    });
  }
  // account_update and template status, category and quality changes.
  for (const key of ["event", "message_template_id", "message_template_name", "message_template_language", "reason", "new_category", "previous_category", "new_quality_score"]) {
    const value = str(v[key]);
    if (value !== undefined) out[key] = value;
  }
  // History and contact syncs: counts only.
  for (const key of ["history", "contacts", "message_echoes"]) {
    if (Array.isArray(v[key])) out[`${key}_count`] = (v[key] as unknown[]).length;
  }
  return out;
}

export async function POST(request: Request) {
  const secret = process.env.SOCIALLYSNAP_WEBHOOK_SECRET ?? "";
  if (secret.length < 24) {
    // Not set up yet: a 503 makes Socially Snap retry later instead of dropping the event.
    console.error(TAG, "SOCIALLYSNAP_WEBHOOK_SECRET is not set");
    return Response.json({ error: "not configured" }, { status: 503 });
  }
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-sociallysnap-signature"), secret)) {
    console.warn(TAG, "bad or old signature", { event_id: request.headers.get("x-sociallysnap-event-id")?.slice(0, 80) ?? null });
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  let event: Obj;
  try {
    event = obj(JSON.parse(raw));
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  console.log(
    TAG,
    JSON.stringify({
      id: str(event.id),
      type: str(event.type),
      created_at: str(event.created_at),
      phone_number_id: str(event.phone_number_id),
      waba_id: str(event.waba_id),
      ...summarize(event.value),
    })
  );
  return Response.json({ ok: true });
}
