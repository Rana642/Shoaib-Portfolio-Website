import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { botInputFrom, holdAction, quietReason, sessionStillValid, type BotGuestMessage } from "./input";

const msg = (over: Partial<BotGuestMessage>): BotGuestMessage => ({ accountId: "a", contactId: "c", wamid: "w", type: "text", body: "hi", at: "2026-11-17T05:00:00Z", raw: {}, ...over });
const extra = { phone: "923001234567", profileName: "Ali Raza", ref: { src: "FB", code: "EFC1" }, receiptLink: "https://adsbyshoaib.com/x" };

describe("botInputFrom", () => {
  it("text", () => {
    assert.deepEqual(botInputFrom(msg({ body: "5 dec" }), extra), { phone: "923001234567", profileName: "Ali Raza", ref: { src: "FB", code: "EFC1" }, receiptLink: "https://adsbyshoaib.com/x", kind: "text", text: "5 dec" });
  });

  it("a button tap carries its id, a list tap its id", () => {
    const b = botInputFrom(msg({ type: "interactive", body: "Book a room", raw: { interactive: { button_reply: { id: "book", title: "Book a room" } } } }), extra);
    assert.equal(b.kind, "button");
    assert.equal(b.id, "book");
    const l = botInputFrom(msg({ type: "interactive", body: "King Room", raw: { interactive: { list_reply: { id: "r_0", title: "King Room" } } } }), extra);
    assert.equal(l.kind, "list");
    assert.equal(l.id, "r_0");
  });

  it("a photo or a document is a receipt candidate", () => {
    assert.equal(botInputFrom(msg({ type: "image", body: null }), extra).kind, "media");
    assert.equal(botInputFrom(msg({ type: "document", body: "receipt.pdf" }), extra).kind, "media");
  });

  it("a template quick-reply button is read as text", () => {
    const i = botInputFrom(msg({ type: "button", body: "Book now", raw: { button: { text: "Book now" } } }), extra);
    assert.deepEqual([i.kind, i.text], ["text", "Book now"]);
  });

  it("everything else (stickers, locations, voice notes) is 'other'", () => {
    for (const type of ["sticker", "location", "audio", "video", "contacts"]) assert.equal(botInputFrom(msg({ type }), extra).kind, "other", type);
  });
});

describe("quietReason", () => {
  const open = { opted_out_at: null, intervened_at: null, resolved_at: null };

  it("talks to a normal chat", () => {
    assert.equal(quietReason(open, { type: "text", body: "hi" }, false), null);
  });
  it("never writes to a guest who opted out", () => {
    assert.equal(quietReason({ ...open, opted_out_at: "2026-11-01T00:00:00Z" }, { type: "text", body: "hi" }, false), "opted_out");
  });
  it("stays out while staff are answering, and comes back once the chat is resolved after that", () => {
    assert.equal(quietReason({ ...open, intervened_at: "2026-11-17T04:00:00Z" }, { type: "text", body: "hi" }, false), "staff_chatting");
    assert.equal(quietReason({ ...open, intervened_at: "2026-11-17T04:00:00Z", resolved_at: "2026-11-17T04:30:00Z" }, { type: "text", body: "hi" }, false), null);
    assert.equal(quietReason({ ...open, intervened_at: "2026-11-17T05:00:00Z", resolved_at: "2026-11-17T04:30:00Z" }, { type: "text", body: "hi" }, false), "staff_chatting");
  });
  it("leaves STOP, START and the marketing YES alone", () => {
    assert.equal(quietReason(open, { type: "text", body: "STOP" }, false), "stop_or_start");
    assert.equal(quietReason(open, { type: "text", body: "start" }, false), "stop_or_start");
    assert.equal(quietReason(open, { type: "text", body: "YES" }, true), "opt_in_answer");
    assert.equal(quietReason(open, { type: "text", body: "YES" }, false), null); // a yes with no question open is just a message
  });
});

describe("sessionStillValid", () => {
  it("a parked conversation restarts after staff resolved the chat", () => {
    assert.equal(sessionStillValid(null, null), false);
    assert.equal(sessionStillValid({ step: "handoff", updatedAt: "2026-11-17T04:00:00Z" }, "2026-11-17T05:00:00Z"), false);
    assert.equal(sessionStillValid({ step: "handoff", updatedAt: "2026-11-17T06:00:00Z" }, "2026-11-17T05:00:00Z"), true);
    assert.equal(sessionStillValid({ step: "await_receipt", updatedAt: "2026-11-17T04:00:00Z" }, "2026-11-17T05:00:00Z"), true);
  });
});

describe("holdAction", () => {
  const now = Date.parse("2026-11-17T10:00:00Z");
  const at = (minLeft: number) => new Date(now + minLeft * 60_000).toISOString();

  it("nothing while there is plenty of time, one reminder in the last 30 minutes, release when the time is up", () => {
    assert.equal(holdAction({ holdUntil: at(90), remindedAt: null }, now, 120), "none");
    assert.equal(holdAction({ holdUntil: at(29), remindedAt: null }, now, 120), "remind");
    assert.equal(holdAction({ holdUntil: at(29), remindedAt: "2026-11-17T09:40:00Z" }, now, 120), "none");
    assert.equal(holdAction({ holdUntil: at(0), remindedAt: "x" }, now, 120), "release");
    assert.equal(holdAction({ holdUntil: at(-5), remindedAt: null }, now, 120), "release");
  });
  it("a short hold reminds at half its time", () => {
    assert.equal(holdAction({ holdUntil: at(25), remindedAt: null }, now, 40), "none");
    assert.equal(holdAction({ holdUntil: at(19), remindedAt: null }, now, 40), "remind");
  });
  it("no hold, no action", () => {
    assert.equal(holdAction({ holdUntil: null, remindedAt: null }, now, 120), "none");
  });
});
