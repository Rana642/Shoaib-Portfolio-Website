// Inbound side of the Socially Snap switch: the platform delivers Meta's changes as signed events
// ({id, type, created_at, waba_id, phone_number_id, value}) and the inbox stores them with the same
// ingestWebhook it uses for Meta's own deliveries. See docs/specs/phase-5-cutover.md in the
// sociallysnap-platform repo.
//
// Rules this file keeps:
// - Nothing is stored unless the switch is "live"; "off" and "test" only log, as before.
// - 2xx only after the event is stored. Any failure answers 500 so the platform retries (3 days).
// - Never log what a person wrote: ids, types and counts only.

import { createHmac, timingSafeEqual } from "node:crypto";
import { sociallySnapMode, type Env } from "./client";

const TOLERANCE_SECONDS = 300;
// Messages and statuses are small; history is not requested for a number on the platform.
export const MAX_BODY_BYTES = 1024 * 1024;

export type MetaPayload = { entry: { time?: number; changes: { field: string; value: unknown }[] }[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** X-SociallySnap-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">, several v1 while a secret rotates. */
export function validSignature(body: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): boolean {
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

/** The platform's envelope in the shape Meta sends, which is what ingestWebhook reads. */
export function toMetaPayload(event: unknown): MetaPayload | null {
  const e = obj(event);
  const type = e.type;
  if (typeof type !== "string" || type === "" || e.value === undefined || e.value === null) return null;
  const created = typeof e.created_at === "string" ? Date.parse(e.created_at) : NaN;
  return { entry: [{ time: Number.isFinite(created) ? Math.floor(created / 1000) : undefined, changes: [{ field: type, value: e.value }] }] };
}

const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * The statuses a message may already have for a new one to replace it. A late retry of "delivered"
 * must not undo "read"; "failed" is Meta's last word and always applies.
 */
export function replaceableStatuses(next: string): string[] | null | undefined {
  if (next === "failed") return null; // null: from any status
  const rank = Object.hasOwn(STATUS_RANK, next) ? STATUS_RANK[next] : undefined;
  if (rank === undefined) return undefined; // not a status we track: ignore it
  return Object.entries(STATUS_RANK)
    .filter(([, r]) => r < rank)
    .map(([name]) => name);
}

export interface InboundDeps {
  env: Env;
  ingest(payload: MetaPayload): Promise<void>;
  log(line: string, data: Obj): void;
}

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export async function handleSociallySnapEvent(rawBody: string, signature: string | null, deps: InboundDeps): Promise<{ status: number; body: Obj }> {
  const secret = deps.env.SOCIALLYSNAP_WEBHOOK_SECRET ?? "";
  if (secret.length < 24) {
    // Not set up yet: 503 makes the platform retry later instead of dropping the event.
    deps.log("SOCIALLYSNAP_WEBHOOK_SECRET is not set", {});
    return { status: 503, body: { error: "not configured" } };
  }
  if (rawBody.length > MAX_BODY_BYTES) return { status: 413, body: { error: "too large" } };
  if (!validSignature(rawBody, signature, secret)) return { status: 401, body: { error: "invalid signature" } };

  let event: Obj;
  try {
    event = obj(JSON.parse(rawBody));
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }
  const value = obj(event.value);
  const summary = {
    id: typeof event.id === "string" ? event.id.slice(0, 80) : null,
    type: typeof event.type === "string" ? event.type.slice(0, 60) : null,
    phone_number_id: typeof event.phone_number_id === "string" ? event.phone_number_id.slice(0, 40) : null,
    messages: count(value.messages),
    statuses: count(value.statuses),
    history: count(value.history),
    message_echoes: count(value.message_echoes),
    state_sync: count(value.state_sync),
  };

  if (sociallySnapMode(deps.env) !== "live") {
    deps.log("event received (not stored: switch is not live)", summary);
    return { status: 200, body: { ok: true } };
  }
  // The envelope's number must be the one inside Meta's value, or the event is not ours to store.
  const declared = typeof event.phone_number_id === "string" ? event.phone_number_id : null;
  const metadata = obj(value.metadata);
  const inside = typeof metadata.phone_number_id === "string" ? metadata.phone_number_id : null;
  if (declared !== null && inside !== null && declared !== inside) {
    deps.log("event numbers disagree, ignored", summary);
    return { status: 200, body: { ok: true } };
  }
  const payload = toMetaPayload(event);
  if (!payload) {
    deps.log("event has no type or value, ignored", summary);
    return { status: 200, body: { ok: true } };
  }
  try {
    await deps.ingest(payload);
  } catch (error) {
    deps.log("storing the event failed", { ...summary, error: error instanceof Error ? error.name : "unknown" });
    return { status: 500, body: { error: "not stored" } };
  }
  deps.log("event stored", summary);
  return { status: 200, body: { ok: true } };
}
