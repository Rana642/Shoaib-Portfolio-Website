import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { handleSociallySnapEvent, replaceableStatuses, toMetaPayload, validSignature, type MetaPayload } from "./inbound";

const SECRET = "x".repeat(32);
const NOW = 1_800_000_000;

const sign = (body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const event = (type: string, value: unknown) => JSON.stringify({ id: "evt_1", type, created_at: "2026-11-14T10:00:00.000Z", waba_id: "1", phone_number_id: "2", value });

function harness(env: Record<string, string | undefined>, ingest: (p: MetaPayload) => Promise<void> = async () => {}) {
  const ingested: MetaPayload[] = [];
  const logs: string[] = [];
  return {
    ingested,
    logs,
    deps: { env, ingest: async (p: MetaPayload) => (await ingest(p), void ingested.push(p)), log: (line: string, data: object) => void logs.push(`${line} ${JSON.stringify(data)}`) },
  };
}

const live = { SOCIALLYSNAP_WEBHOOK_SECRET: SECRET, WHATSAPP_VIA_SOCIALLY_SNAP: "live" };

test("signature: valid, tampered, wrong secret, old, rotating secrets", () => {
  const body = "{}";
  assert.equal(validSignature(body, sign(body, SECRET, NOW), SECRET, NOW), true);
  assert.equal(validSignature("{ }", sign(body, SECRET, NOW), SECRET, NOW), false);
  assert.equal(validSignature(body, sign(body, "y".repeat(32), NOW), SECRET, NOW), false);
  assert.equal(validSignature(body, sign(body, SECRET, NOW - 301), SECRET, NOW), false);
  assert.equal(validSignature(body, null, SECRET, NOW), false);
  const two = `${sign(body, "z".repeat(32), NOW)},v1=${createHmac("sha256", SECRET).update(`${NOW}.${body}`).digest("hex")}`;
  assert.equal(validSignature(body, two, SECRET, NOW), true);
});

test("toMetaPayload wraps field, value and time; refuses an event without a type or value", () => {
  const payload = toMetaPayload(JSON.parse(event("messages", { metadata: { phone_number_id: "2" } })));
  assert.deepEqual(payload, { entry: [{ time: 1_794_650_400, changes: [{ field: "messages", value: { metadata: { phone_number_id: "2" } } }] }] });
  assert.equal(toMetaPayload({ type: "messages" }), null);
  assert.equal(toMetaPayload({ value: {} }), null);
  assert.equal(toMetaPayload(null), null);
});

test("every event type the inbox needs is passed on whole", () => {
  for (const type of ["messages", "history", "smb_message_echoes", "smb_app_state_sync"]) {
    const value = { metadata: { phone_number_id: "2" }, [type]: [1, 2] };
    assert.deepEqual(toMetaPayload({ type, value })?.entry[0]?.changes[0], { field: type, value });
  }
});

test("status never moves backwards, failed always applies", () => {
  assert.deepEqual(replaceableStatuses("sent"), []); // only over a message with no status yet
  assert.deepEqual(replaceableStatuses("delivered"), ["sent"]);
  assert.deepEqual(replaceableStatuses("read"), ["sent", "delivered"]);
  assert.equal(replaceableStatuses("failed"), null);
  assert.equal(replaceableStatuses("deleted"), undefined);
  assert.equal(replaceableStatuses("constructor"), undefined);
});

test("live: a good event is stored, then 200", async () => {
  const h = harness(live);
  const body = event("messages", { metadata: { phone_number_id: "2" }, messages: [{ id: "w", type: "text", text: { body: "secret words" } }] });
  const result = await handleSociallySnapEvent(body, sign(body), h.deps);
  assert.equal(result.status, 200);
  assert.equal(h.ingested.length, 1);
  assert.equal(h.ingested[0]?.entry[0]?.changes[0]?.field, "messages");
  assert.ok(!h.logs.join("\n").includes("secret words"), "logs hold counts, never what a person wrote");
});

test("live: a failing store answers 500 so the platform retries", async () => {
  const h = harness(live, async () => {
    throw new Error("database write failed: 57014 with private text");
  });
  const body = event("messages", { metadata: { phone_number_id: "2" } });
  const result = await handleSociallySnapEvent(body, sign(body), h.deps);
  assert.equal(result.status, 500);
  assert.ok(!h.logs.join("\n").includes("private text"), "the error message is not logged");
});

test("bad signature is 401 and nothing is stored", async () => {
  const h = harness(live);
  const body = event("messages", { metadata: { phone_number_id: "2" } });
  assert.equal((await handleSociallySnapEvent(body, sign(body, "y".repeat(32)), h.deps)).status, 401);
  assert.equal((await handleSociallySnapEvent(body, null, h.deps)).status, 401);
  assert.equal(h.ingested.length, 0);
});

test("secret missing or short is 503 (retry later), in every mode", async () => {
  for (const secret of [undefined, "", "short"]) {
    const h = harness({ SOCIALLYSNAP_WEBHOOK_SECRET: secret, WHATSAPP_VIA_SOCIALLY_SNAP: "live" });
    assert.equal((await handleSociallySnapEvent("{}", null, h.deps)).status, 503);
  }
});

test("off, test, unset and a mistyped switch only log, never store", async () => {
  for (const mode of [undefined, "", "off", "test", "tset"]) {
    const h = harness({ SOCIALLYSNAP_WEBHOOK_SECRET: SECRET, WHATSAPP_VIA_SOCIALLY_SNAP: mode });
    const body = event("messages", { metadata: { phone_number_id: "2" }, messages: [{ id: "w" }] });
    const result = await handleSociallySnapEvent(body, sign(body), h.deps);
    assert.equal(result.status, 200, String(mode));
    assert.equal(h.ingested.length, 0, String(mode));
    assert.ok(h.logs.length > 0);
  }
});

test("a body over 1 MB is 413 before the signature is checked; envelope and value numbers must agree", async () => {
  const h = harness(live);
  const big = "x".repeat(1024 * 1024 + 1);
  assert.equal((await handleSociallySnapEvent(big, sign(big), h.deps)).status, 413);
  const mismatch = JSON.stringify({ id: "e", type: "messages", phone_number_id: "2", value: { metadata: { phone_number_id: "3" } } });
  assert.equal((await handleSociallySnapEvent(mismatch, sign(mismatch), h.deps)).status, 200);
  assert.equal(h.ingested.length, 0);
});

test("not JSON is 400; an event without a type is acknowledged and dropped", async () => {
  const h = harness(live);
  const junk = "not json";
  assert.equal((await handleSociallySnapEvent(junk, sign(junk), h.deps)).status, 400);
  const empty = JSON.stringify({ id: "evt_2" });
  assert.equal((await handleSociallySnapEvent(empty, sign(empty), h.deps)).status, 200);
  assert.equal(h.ingested.length, 0);
});
