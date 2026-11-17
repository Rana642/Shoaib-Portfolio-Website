import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DRY_RUN_MESSAGE, interactiveMessage } from "./client";
import { sendInteractiveViaSociallySnap } from "./send";

const LIVE_KEY = "ss_live_abcdefghij23_" + "B".repeat(43);
const TEST_KEY = "ss_test_abcdefghij23_" + "A".repeat(43);
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const BUTTONS = { type: "button", body: { text: "Hi" }, action: { buttons: [{ type: "reply", reply: { id: "book", title: "Book a room" } }] } };

describe("interactive messages through Socially Snap", () => {
  it("builds Meta's message with the number to send from", () => {
    assert.deepEqual(interactiveMessage("9230", BUTTONS, "1000"), { messaging_product: "whatsapp", to: "9230", type: "interactive", interactive: BUTTONS, from: "1000" });
  });

  it("sends the interactive object as it is and returns the wamid of a real send", async () => {
    let sentBody: unknown;
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return ok({ messages: [{ id: "wamid.REAL" }] });
    }) as typeof fetch;
    const sent = await sendInteractiveViaSociallySnap("9230", BUTTONS, "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "live", SOCIALLYSNAP_API_KEY_LIVE: LIVE_KEY }, fetchImpl);
    assert.deepEqual(sent, { wamid: "wamid.REAL" });
    assert.deepEqual((sentBody as { interactive: unknown }).interactive, BUTTONS);
    assert.equal((sentBody as { type: string }).type, "interactive");
  });

  it("in test mode every success is a dry run, never a wamid", async () => {
    const sent = await sendInteractiveViaSociallySnap("9230", BUTTONS, "1000", { WHATSAPP_VIA_SOCIALLY_SNAP: "test", SOCIALLYSNAP_API_KEY_TEST: TEST_KEY }, (async () => ok({ messages: [{ id: "wamid.LOOKS_REAL" }] })) as typeof fetch);
    assert.deepEqual(sent, { error: DRY_RUN_MESSAGE });
  });
});
