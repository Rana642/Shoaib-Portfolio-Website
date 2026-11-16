import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "./client";
import { chooseLink, clientForLinked, createTemplateViaSociallySnap, deleteTemplateViaSociallySnap, listTemplatesViaSociallySnap, platformNumbers, toPlatformNumbers } from "./link";

const LIVE_KEY = "ss_live_abcdefghij23_" + "B".repeat(43);
const TEST_KEY = "ss_test_abcdefghij23_" + "A".repeat(43);
const PROJECT = "11111111-2222-3333-4444-555555555555";

interface Seen {
  url: string;
  method: string;
  body: string | undefined;
}

function clientWith(answer: (seen: Seen) => Response, log: Seen[] = []) {
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const seen = { url, method: init.method ?? "GET", body: init.body as string | undefined };
    log.push(seen);
    return answer(seen);
  }) as unknown as typeof fetch;
  return createClient({ apiKey: LIVE_KEY, fetch: fetchImpl });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const silverSand = { phone_number_id: "1000000000001", waba_id: "2000000000001", display_phone_number: "+92 300 8720939", verified_name: "Hotel Silver Sand", can_send: true };

describe("toPlatformNumbers", () => {
  it("keeps rows with digit ids and drops the rest", () => {
    const rows = toPlatformNumbers([silverSand, { phone_number_id: "abc", waba_id: "2000000000001" }, { phone_number_id: "1000000000002" }, null, "x", { ...silverSand, waba_id: "20/00" }]);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { phoneNumberId: "1000000000001", wabaId: "2000000000001", displayPhone: "+92 300 8720939", name: "Hotel Silver Sand", canSend: true });
  });
});

describe("chooseLink", () => {
  const available = toPlatformNumbers([silverSand]);

  it("takes a listed number and a hotel", () => {
    const r = chooseLink({ phone_number_id: "1000000000001", project_id: PROJECT, label: "  Silver Sand  " }, available);
    assert.ok("value" in r);
    assert.equal(r.value.number.wabaId, "2000000000001");
    assert.equal(r.value.label, "Silver Sand");
  });

  it("refuses a number the workspace doesn't have, so ids are never trusted from the form", () => {
    const r = chooseLink({ phone_number_id: "9999999999999", project_id: PROJECT }, available);
    assert.ok("error" in r);
  });

  it("refuses a missing or malformed hotel", () => {
    for (const project_id of [undefined, "", "not-a-uuid", "1' or '1'='1"]) {
      assert.ok("error" in chooseLink({ phone_number_id: "1000000000001", project_id }, available), String(project_id));
    }
  });

  it("caps the label and treats a blank one as none", () => {
    const long = chooseLink({ phone_number_id: "1000000000001", project_id: PROJECT, label: "x".repeat(200) }, available);
    assert.ok("value" in long);
    assert.equal(long.value.label?.length, 80);
    const blank = chooseLink({ phone_number_id: "1000000000001", project_id: PROJECT, label: "   " }, available);
    assert.ok("value" in blank);
    assert.equal(blank.value.label, null);
  });
});

describe("clientForLinked", () => {
  it("refuses everything when the switch is off or mistyped, never falling back to Meta", () => {
    for (const value of [undefined, "off", "tset"]) {
      assert.throws(() => clientForLinked(false, { WHATSAPP_VIA_SOCIALLY_SNAP: value, SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }), /Socially Snap/, String(value));
    }
  });

  it("lets test mode read but not write, because a test write is only a dry run", () => {
    const env = { WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY };
    assert.ok(clientForLinked(false, env));
    assert.throws(() => clientForLinked(true, env), /live/);
  });

  it("works in live mode with a live key, and says so when the key is missing", () => {
    assert.ok(clientForLinked(true, { WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }));
    assert.throws(() => clientForLinked(true, { WHATSAPP_VIA_SOCIALLY_SNAP: "live" }), /SOCIALLYSNAP_API_KEY_LIVE/);
  });
});

describe("through the API", () => {
  it("lists the workspace's numbers", async () => {
    const seen: Seen[] = [];
    const numbers = await platformNumbers(clientWith(() => json({ data: [silverSand] }), seen));
    assert.equal(numbers[0]?.displayPhone, "+92 300 8720939");
    assert.equal(seen[0]?.url.endsWith("/v1/phone_numbers"), true);
  });

  it("lists templates of one number with from", async () => {
    const seen: Seen[] = [];
    const list = await listTemplatesViaSociallySnap("1000000000001", clientWith(() => json({ data: [{ name: "offer" }], paging: { has_more: false } }), seen));
    assert.equal(list.length, 1);
    assert.match(seen[0]!.url, /from=1000000000001/);
  });

  it("creates a template for that number only, sending Meta's body plus from", async () => {
    const seen: Seen[] = [];
    const template = { name: "winter_offer", language: "en", category: "MARKETING", components: [{ type: "BODY", text: "Hello, our winter offer is on." }] };
    const r = await createTemplateViaSociallySnap("1000000000001", template, clientWith(() => json({ id: "77", status: "PENDING" }), seen));
    assert.equal(r.status, "PENDING");
    const sent = JSON.parse(seen[0]!.body ?? "{}");
    assert.equal(sent.from, "1000000000001");
    assert.equal(sent.category, "MARKETING");
  });

  it("never reports a dry run as a submitted template", async () => {
    const dry = clientWith(() => json({ id: "t", status: "PENDING", test: true }));
    await assert.rejects(() => createTemplateViaSociallySnap("1000000000001", { name: "a" }, dry), /not submitted/);
  });

  it("turns an API refusal into a readable error", async () => {
    const refused = clientWith(() => json({ error: { code: "number_unavailable", message: "That number is disconnected." } }, 409));
    await assert.rejects(() => listTemplatesViaSociallySnap("1000000000001", refused), /disconnected/);
    await assert.rejects(() => deleteTemplateViaSociallySnap("1000000000001", "offer", refused), /disconnected/);
  });

  it("deletes by name for one number", async () => {
    const seen: Seen[] = [];
    await deleteTemplateViaSociallySnap("1000000000001", "winter_offer", clientWith(() => json({ success: true }), seen));
    assert.equal(seen[0]?.method, "DELETE");
    assert.match(seen[0]!.url, /name=winter_offer&from=1000000000001/);
  });
});
