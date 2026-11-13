import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientFromEnv, createClient, DRY_RUN_MESSAGE, sociallySnapMode, templateMessage, textMessage, unattendedSendingAllowed } from "./client";
import { failureText, sendTemplateViaSociallySnap, sendTextViaSociallySnap } from "./send";

const TEST_KEY = "ss_test_abcdefghij23_" + "A".repeat(43);
const LIVE_KEY = "ss_live_abcdefghij23_" + "B".repeat(43);

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
}

function fakeFetch(answer: (seen: Seen) => Response | Promise<Response>, log: Seen[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    const seen = { url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body as Seen["body"] };
    log.push(seen);
    return answer(seen);
  }) as unknown as typeof fetch;
}

const ok = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
const fail = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("sociallySnapMode", () => {
  it("is off only when unset, empty or off", () => {
    for (const value of [undefined, "", "  ", "off", "OFF"]) assert.equal(sociallySnapMode({ WHATSAPP_VIA_SOCIALLY_SNAP: value }), "off", String(value));
  });

  it("reads test and live whatever the case or spacing", () => {
    assert.equal(sociallySnapMode({ WHATSAPP_VIA_SOCIALLY_SNAP: "test" }), "test");
    assert.equal(sociallySnapMode({ WHATSAPP_VIA_SOCIALLY_SNAP: " TEST " }), "test");
    assert.equal(sociallySnapMode({ WHATSAPP_VIA_SOCIALLY_SNAP: "Live" }), "live");
  });

  it("calls any other value invalid, never off, so a typo can't fall back to Meta", () => {
    for (const value of ["tset", "true", "dry", "1", "live2"]) assert.equal(sociallySnapMode({ WHATSAPP_VIA_SOCIALLY_SNAP: value }), "invalid", value);
  });
});

describe("unattendedSendingAllowed", () => {
  it("allows broadcasts and automation when off, and when live with a live key only", () => {
    assert.equal(unattendedSendingAllowed({}), true);
    assert.equal(unattendedSendingAllowed({ WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }), true);
    assert.equal(unattendedSendingAllowed({ WHATSAPP_VIA_SOCIALLY_SNAP: "live" }), false);
    assert.equal(unattendedSendingAllowed({ WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: TEST_KEY }), false);
  });

  it("refuses in test mode and with an invalid setting, so nothing is spent on dry runs", () => {
    assert.equal(unattendedSendingAllowed({ WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY }), false);
    assert.equal(unattendedSendingAllowed({ WHATSAPP_VIA_SOCIALLY_SNAP: "tset" }), false);
  });
});

describe("clientFromEnv", () => {
  it("refuses when off, or when the key for the mode is missing or of the wrong kind", () => {
    for (const env of [
      {},
      { WHATSAPP_VIA_SOCIALLY_SNAP: "test" },
      { WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: LIVE_KEY },
      { WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: TEST_KEY },
      { WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY },
    ]) {
      const client = clientFromEnv(env);
      assert.ok("failure" in client);
      assert.equal(client.failure.code, "not_configured");
      assert.ok(!client.failure.message.includes("abcdefghij23"), "never echoes a key");
    }
  });

  it("refuses an invalid mode and says so", () => {
    const client = clientFromEnv({ WHATSAPP_VIA_SOCIALLY_SNAP: "tset", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY });
    assert.ok("failure" in client && /must be off, test or live/.test(client.failure.message));
  });

  it("uses the test key in test mode and the live key in live mode", async () => {
    const log: Seen[] = [];
    const answer = () => ok({ messaging_product: "whatsapp", messages: [{ id: "wamid.X" }] });
    for (const [mode, key] of [["test", TEST_KEY], ["live", LIVE_KEY]] as const) {
      const client = clientFromEnv({ WHATSAPP_VIA_SOCIALLY_SNAP: mode, SOCIALLYSNAP_API_KEY_TEST: TEST_KEY, SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }, fakeFetch(answer, log));
      assert.ok(!("failure" in client));
      await (client as ReturnType<typeof createClient>).sendMessage(textMessage("923001573098", "hi"));
      assert.equal(log.at(-1)?.headers["X-API-Key"], key);
    }
  });
});

describe("sendMessage", () => {
  const client = (answer: Parameters<typeof fakeFetch>[0], log?: Seen[]) => createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(answer, log) });

  it("posts Meta's body to /v1/messages and returns the wamid", async () => {
    const log: Seen[] = [];
    const result = await client(() => ok({ messages: [{ id: "wamid.ABC" }] }), log).sendMessage(textMessage("923001573098", "hello", "100000000000001"));
    assert.deepEqual(result, { ok: true, test: false, wamid: "wamid.ABC" });
    assert.equal(log[0]?.url, "https://api.sociallysnap.app/v1/messages");
    assert.equal(log[0]?.method, "POST");
    assert.deepEqual(JSON.parse(String(log[0]?.body)), { messaging_product: "whatsapp", to: "923001573098", type: "text", text: { body: "hello" }, from: "100000000000001" });
  });

  it("marks a dry run", async () => {
    const result = await client(() => ok({ messages: [{ id: "wamid.test_abc" }], test: true })).sendMessage(textMessage("1", "x"));
    assert.ok(result.ok && result.test);
  });

  it("maps every error code and keeps Meta's code and the wait", async () => {
    for (const code of ["invalid_request", "unauthorized", "number_unavailable", "recipient_opted_out", "internal_error"] as const) {
      const result = await client(() => fail(400, { error: { code, message: `m ${code}` } })).sendMessage({});
      assert.ok(!result.ok);
      assert.equal(result.failure.code, code);
      assert.equal(result.failure.message, `m ${code}`);
      assert.equal(result.failure.mayHaveSent, false, `${code} was refused, so nothing went out`);
    }
    const limited = await client(() => fail(429, { error: { code: "rate_limited", message: "slow" } }, { "retry-after": "7" })).sendMessage({});
    assert.ok(!limited.ok && limited.failure.retryAfterSeconds === 7);
    const rejected = await client(() => fail(400, { error: { code: "meta_rejected", message: "no", meta: { code: 131047 } } })).sendMessage({});
    assert.ok(!rejected.ok && rejected.failure.metaCode === 131047 && rejected.failure.code === "meta_rejected");
  });

  it("says a send may have gone out when Meta didn't answer clearly, and never retries it", async () => {
    const log: Seen[] = [];
    const result = await client(() => fail(502, { error: { code: "meta_unavailable", message: "unclear" } }), log).sendMessage({});
    assert.ok(!result.ok && result.failure.code === "meta_unavailable" && result.failure.mayHaveSent);
    assert.equal(log.length, 1);
  });

  it("treats a network failure or timeout on a send as possibly sent, once", async () => {
    for (const name of ["TypeError", "TimeoutError"]) {
      let calls = 0;
      const c = createClient({
        apiKey: LIVE_KEY,
        fetch: (async () => {
          calls++;
          throw Object.assign(new Error("x"), { name });
        }) as unknown as typeof fetch,
      });
      const result = await c.sendMessage({});
      assert.ok(!result.ok && result.failure.mayHaveSent);
      assert.equal(result.failure.code, name === "TimeoutError" ? "timeout" : "network");
      assert.equal(calls, 1);
    }
  });

  it("says a send may have gone out on any 5xx, including a 500 internal_error", async () => {
    for (const status of [500, 502, 503]) {
      const code = status === 502 ? "meta_unavailable" : "internal_error";
      const result = await client(() => fail(status, { error: { code, message: "boom" } })).sendMessage({});
      assert.ok(!result.ok && result.failure.mayHaveSent, String(status));
    }
  });

  it("treats a 4xx it can't read, or with a code it doesn't know, as possibly sent; a known refusal is not", async () => {
    const html = await client(() => new Response("<html>bad gateway</html>", { status: 400 })).sendMessage({});
    assert.ok(!html.ok && html.failure.code === "bad_response" && html.failure.mayHaveSent);
    const unknown = await client(() => fail(400, { error: { code: "something_new", message: "?" } })).sendMessage({});
    assert.ok(!unknown.ok && unknown.failure.code === "bad_response" && unknown.failure.mayHaveSent);
    const notFound = await client(() => fail(404, { error: { code: "not_found", message: "No such number." } })).sendMessage({});
    assert.ok(!notFound.ok && notFound.failure.code === "not_found" && !notFound.failure.mayHaveSent);
  });

  it("gives every call a timeout signal", async () => {
    let signal: AbortSignal | null | undefined;
    const c = createClient({ apiKey: LIVE_KEY, fetch: (async (_url: string, init: RequestInit) => ((signal = init.signal), ok({ messages: [{ id: "wamid.A" }] }))) as unknown as typeof fetch });
    await c.sendMessage({});
    assert.ok(signal instanceof AbortSignal);
  });

  it("calls an unreadable success a bad response that may have sent", async () => {
    const result = await client(() => ok({ nonsense: true })).sendMessage({});
    assert.ok(!result.ok && result.failure.code === "bad_response" && result.failure.mayHaveSent);
  });

  it("never puts the key in an error", async () => {
    const result = await client(() => fail(401, { error: { code: "unauthorized", message: "bad key" } })).sendMessage({});
    assert.ok(!JSON.stringify(result).includes("ss_live_"));
  });
});

describe("other calls", () => {
  it("uploads media as multipart with the file and the number", async () => {
    const log: Seen[] = [];
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => ok({ id: "123" }), log) });
    const result = await c.uploadMedia(new Blob(["x"], { type: "image/png" }), "a.png", "100000000000001");
    assert.deepEqual(result, { ok: true, test: false, id: "123" });
    const form = log[0]?.body as FormData;
    assert.ok(form.get("file") instanceof File);
    assert.equal(form.get("from"), "100000000000001");
    assert.equal(log[0]?.headers["Content-Type"], undefined, "fetch sets the multipart boundary itself");
  });

  it("downloads media bytes and content type", async () => {
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) });
    const result = await c.downloadMedia("12/34");
    assert.ok(result.ok && result.contentType === "image/jpeg" && new Uint8Array(result.bytes).length === 3);
  });

  it("reads media details, phone numbers and creates a template", async () => {
    const log: Seen[] = [];
    const c = createClient({
      apiKey: LIVE_KEY,
      fetch: fakeFetch((seen) => (seen.url.includes("/v1/phone_numbers") ? ok({ data: [{ id: "n" }] }) : seen.url.includes("/v1/templates") ? ok({ id: "99", status: "PENDING" }) : ok({ id: "7", mime_type: "image/png" })), log),
    });
    const details = await c.mediaDetails("7", "1000");
    assert.ok(details.ok && details.details.mime_type === "image/png");
    assert.equal(log[0]?.url, "https://api.sociallysnap.app/v1/media/7?from=1000");
    const numbers = await c.phoneNumbers();
    assert.ok(numbers.ok && numbers.data.length === 1);
    const created = await c.createTemplate({ name: "t", language: "en_US", category: "UTILITY", components: [] });
    assert.deepEqual(created, { ok: true, test: false, id: "99", status: "PENDING" });
    assert.equal(log[2]?.method, "POST");
  });

  it("passes the number along when asked", async () => {
    const log: Seen[] = [];
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => ok({ data: [], paging: { after: null, has_more: false } }), log) });
    await c.listTemplates("1000");
    assert.equal(log[0]?.url, "https://api.sociallysnap.app/v1/templates?limit=100&from=1000");
  });

  it("reports an interrupted download as a failure instead of throwing", async () => {
    const broken = new Response("x", { status: 200 });
    (broken as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    };
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => broken) });
    const result = await c.downloadMedia("1");
    assert.ok(!result.ok && result.failure.code === "timeout");
  });

  it("doesn't call a list complete when the API says there is more but gives no cursor", async () => {
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => ok({ data: [{ n: 1 }], paging: { after: null, has_more: true } })) });
    const result = await c.listTemplates();
    assert.ok(result.ok && result.hasMore === true);
  });

  it("encodes names in the query", async () => {
    const log: Seen[] = [];
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => ok({ success: true }), log) });
    await c.deleteTemplate("a b&c");
    assert.equal(log[0]?.url, "https://api.sociallysnap.app/v1/templates?name=a%20b%26c");
    assert.equal(log[0]?.method, "DELETE");
  });

  it("pages through templates and says when there is more", async () => {
    const pages = [
      ok({ data: [{ name: "a" }], paging: { after: "CUR1", has_more: true } }),
      ok({ data: [{ name: "b" }], paging: { after: null, has_more: false } }),
    ];
    const log: Seen[] = [];
    const c = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => pages.shift()!, log) });
    const result = await c.listTemplates();
    assert.ok(result.ok && result.data.length === 2 && result.hasMore === false);
    assert.equal(log[1]?.url, "https://api.sociallysnap.app/v1/templates?limit=100&after=CUR1");

    const endless = createClient({ apiKey: LIVE_KEY, fetch: fakeFetch(() => ok({ data: [], paging: { after: "X", has_more: true } })) });
    const capped = await endless.listTemplates();
    assert.ok(capped.ok && capped.hasMore === true);
  });
});

describe("message builders", () => {
  it("builds the same template body the inbox sends today", () => {
    assert.deepEqual(templateMessage("9230", "hello_world", "en_US", ["Ali"], "1000"), {
      messaging_product: "whatsapp",
      to: "9230",
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: "Ali" }] }] },
      from: "1000",
    });
    assert.ok(!("components" in templateMessage("9230", "n", "en_US", []).template));
  });
});

describe("sending through Socially Snap for the inbox", () => {
  const env = { WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY };

  it("returns the wamid of a real send", async () => {
    const sent = await sendTextViaSociallySnap("9230", "hi", "1000", env, fakeFetch(() => ok({ messages: [{ id: "wamid.REAL" }] })));
    assert.deepEqual(sent, { wamid: "wamid.REAL" });
  });

  it("turns a dry run into a notice, never a wamid, in every way it can be marked", async () => {
    for (const answer of [{ messages: [{ id: "wamid.test_1" }], test: true }, { messages: [{ id: "wamid.test_2" }] }, { messages: [{ id: "wamid.REAL" }], test: true }]) {
      const sent = await sendTextViaSociallySnap("9230", "hi", "1000", env, fakeFetch(() => ok(answer)));
      assert.deepEqual(sent, { error: DRY_RUN_MESSAGE });
    }
    const template = await sendTemplateViaSociallySnap("9230", "n", "en_US", [], "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY }, fakeFetch(() => ok({ messages: [{ id: "wamid.test_9" }], test: true })));
    assert.deepEqual(template, { error: DRY_RUN_MESSAGE });
  });

  it("treats every success as a dry run in test mode, even one that looks real", async () => {
    const sent = await sendTextViaSociallySnap("9230", "hi", "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY }, fakeFetch(() => ok({ messages: [{ id: "wamid.LOOKS_REAL" }] })));
    assert.deepEqual(sent, { error: DRY_RUN_MESSAGE });
  });

  it("refuses to send, and never calls out, when the mode is invalid", async () => {
    let calls = 0;
    const sent = await sendTextViaSociallySnap("9230", "hi", "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "tset", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }, fakeFetch(() => (calls++, ok({}))));
    assert.ok("error" in sent && /must be off, test or live/.test(sent.error));
    assert.equal(calls, 0);
  });

  it("does not fall back to Meta when it is not configured", async () => {
    let calls = 0;
    const sent = await sendTextViaSociallySnap("9230", "hi", "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "live" }, fakeFetch(() => (calls++, ok({}))));
    assert.ok("error" in sent && /SOCIALLYSNAP_API_KEY_LIVE/.test(sent.error));
    assert.equal(calls, 0);
  });

  it("words failures for staff", async () => {
    const maybe = await sendTextViaSociallySnap("9230", "hi", "1000", env, fakeFetch(() => fail(502, { error: { code: "meta_unavailable", message: "unclear" } })));
    assert.ok("error" in maybe && /may have gone out/.test(maybe.error));
    const limited = await sendTextViaSociallySnap("9230", "hi", "1000", env, fakeFetch(() => fail(429, { error: { code: "rate_limited", message: "Slow down." } }, { "retry-after": "1" })));
    assert.ok("error" in limited && limited.error === "Slow down. Try again in 1 s.");
    const optedOut = await sendTextViaSociallySnap("9230", "hi", "1000", env, fakeFetch(() => fail(409, { error: { code: "recipient_opted_out", message: "This person sent STOP." } })));
    assert.deepEqual(optedOut, { error: "This person sent STOP." });
    assert.ok(failureText({ code: "timeout", message: "x", status: null, metaCode: null, retryAfterSeconds: null, mayHaveSent: true }).includes("may have gone out"));
  });
});
