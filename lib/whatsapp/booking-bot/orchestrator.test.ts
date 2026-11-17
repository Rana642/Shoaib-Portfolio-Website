import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotConfig, BotSession, HotelApi } from "./engine";
import type { BotGuestMessage } from "./input";
import { processGuestMessage, type ContactRow, type RunnerDeps, type StoredSession } from "./orchestrator";

const NOW = new Date("2026-11-17T05:00:00Z");
const CONFIG: BotConfig = { hotelName: "Hotel Elegant Executive Suites", advance: { mode: "percent", value: 30 }, holdMinutes: 120, paymentText: "Easypaisa 0300 0000000", info: [] };
const ROOMS = [{ roomId: "r1", name: "King Room", total: 17000, perNight: 8500, nights: 2, refundable: true, requiresAdvance: false, available: true }];

const CONTACT: ContactRow = { id: "c1", wa_id: "923001234567", name: "Ali Raza", ref_source: "FB", ref_code: "EFC1", opted_out_at: null, intervened_at: null, resolved_at: null };
const msg = (over: Partial<BotGuestMessage> = {}): BotGuestMessage => ({ accountId: "a1", contactId: "c1", wamid: "w1", type: "text", body: "hi", at: NOW.toISOString(), raw: {}, ...over });

function fakeApi(): HotelApi {
  return {
    lookup: async () => ({ ok: true, bookings: [] }),
    quote: async () => ({ ok: true, nights: 2, rooms: ROOMS }),
    create: async () => ({ ok: true, bookingRef: "HE-NEW123", grandTotal: 17000, roomName: "King Room" }),
    attachReceipt: async () => ({ ok: true }),
    cancel: async () => ({ ok: true }),
  };
}

type World = {
  deps: RunnerDeps;
  sessions: Map<string, StoredSession>;
  texts: string[];
  interactives: Record<string, unknown>[];
  booked: unknown[];
  handoffs: string[];
  logs: string[];
};
function world(over: { account?: boolean; staffChatting?: boolean; contact?: Partial<ContactRow>; sendInteractive?: () => { error: string } | { ok: true }; sendText?: () => { error: string } | { ok: true }; optInOpen?: boolean } = {}): World {
  const w: World = { deps: null as unknown as RunnerDeps, sessions: new Map(), texts: [], interactives: [], booked: [], handoffs: [], logs: [] };
  w.deps = {
    account: async () => (over.account === false ? null : { config: CONFIG, api: fakeApi() }),
    contact: async () => ({ ...CONTACT, ...over.contact }),
    loadSession: async (id) => w.sessions.get(id) ?? null,
    saveSession: async (id, _a, s, wamid) => { w.sessions.set(id, { session: s, lastWamid: wamid, updatedAt: NOW.toISOString() }); },
    optInOpen: async () => over.optInOpen ?? false,
    staffIsChatting: async () => over.staffChatting ?? true,
    sendText: async (_id, body) => { const r = over.sendText?.() ?? { ok: true as const }; if ("ok" in r) w.texts.push(body); return r; },
    sendInteractive: async (_id, i) => { const r = over.sendInteractive?.() ?? { ok: true as const }; if ("ok" in r) w.interactives.push(i); return r; },
    recordBooking: async (_id, c) => { w.booked.push(c); },
    handoff: async (id) => { w.handoffs.push(id); },
    now: () => NOW,
    receiptLinkFor: (id) => `https://adsbyshoaib.com/dashboard/whatsapp?chat=${id}`,
    log: (l) => w.logs.push(l),
  };
  return w;
}

describe("when the bot answers", () => {
  it("says hello with buttons and saves where the guest is", async () => {
    const w = world();
    const r = await processGuestMessage(msg(), w.deps);
    assert.deepEqual(r, { ran: true, sent: 1 });
    assert.equal(w.interactives.length, 1);
    assert.equal((w.interactives[0] as { type: string }).type, "button");
    assert.equal(w.sessions.get("c1")?.session.step, "menu");
    assert.equal(w.sessions.get("c1")?.lastWamid, "w1");
  });

  it("is off for a number without the bot", async () => {
    const w = world({ account: false });
    assert.deepEqual(await processGuestMessage(msg(), w.deps), { ran: false, reason: "bot_off" });
    assert.equal(w.interactives.length + w.texts.length, 0);
  });

  it("a button tap continues the conversation", async () => {
    const w = world();
    await processGuestMessage(msg(), w.deps);
    const r = await processGuestMessage(msg({ wamid: "w2", type: "interactive", body: "Book a room", raw: { interactive: { button_reply: { id: "book", title: "Book a room" } } } }), w.deps);
    assert.equal(r.ran, true);
    assert.equal(w.sessions.get("c1")?.session.step, "ask_checkin");
    assert.match(w.texts[0], /check-in date/);
  });

  it("a booking is recorded on the chat with the booking ref, and the receipt hands the chat to staff", async () => {
    const w = world();
    w.sessions.set("c1", {
      session: { step: "confirm", data: { checkIn: "2026-12-05", nights: 2, adults: 2, children: 0, roomId: "r1", roomName: "King Room", total: 17000, guestName: "Ali Raza" }, strikes: 0 },
      lastWamid: "w0",
      updatedAt: NOW.toISOString(),
    });
    await processGuestMessage(msg({ wamid: "w5", type: "interactive", raw: { interactive: { button_reply: { id: "confirm", title: "Confirm booking" } } } }), w.deps);
    assert.equal(w.booked.length, 1);
    assert.equal((w.booked[0] as { bookingRef: string }).bookingRef, "HE-NEW123");
    assert.equal(w.handoffs.length, 0); // waiting for the guest's payment is not a job for staff yet
    await processGuestMessage(msg({ wamid: "w6", type: "image", body: null }), w.deps);
    assert.deepEqual(w.handoffs, ["c1"]); // now staff must check the payment
    assert.equal(w.sessions.get("c1")?.session.step, "done");
  });
});

describe("when the bot stays quiet", () => {
  it("opted out", async () => {
    const w = world({ contact: { opted_out_at: "2026-11-01T00:00:00Z" } });
    assert.equal((await processGuestMessage(msg(), w.deps)).reason, "opted_out");
    assert.equal(w.interactives.length + w.texts.length, 0);
  });
  it("staff are answering", async () => {
    const w = world({ contact: { intervened_at: "2026-11-17T04:00:00Z" } });
    assert.equal((await processGuestMessage(msg(), w.deps)).reason, "staff_chatting");
  });
  it("but the phone app's canned greeting is not staff: the bot keeps answering", async () => {
    const w = world({ contact: { intervened_at: "2026-11-17T04:00:00Z" }, staffChatting: false });
    const r = await processGuestMessage(msg(), w.deps);
    assert.equal(r.ran, true);
    assert.equal(w.interactives.length, 1);
  });
  it("STOP and the marketing YES", async () => {
    assert.equal((await processGuestMessage(msg({ body: "STOP" }), world().deps)).reason, "stop_or_start");
    assert.equal((await processGuestMessage(msg({ body: "YES" }), world({ optInOpen: true }).deps)).reason, "opt_in_answer");
  });
  it("a webhook retry of the same message is not answered twice", async () => {
    const w = world();
    await processGuestMessage(msg(), w.deps);
    const again = await processGuestMessage(msg(), w.deps);
    assert.deepEqual(again, { ran: false, reason: "already_handled" });
    assert.equal(w.interactives.length, 1);
  });
  it("a chat parked with staff starts fresh after staff resolved it", async () => {
    const w = world({ contact: { resolved_at: "2026-11-17T06:00:00Z" } });
    w.sessions.set("c1", { session: { step: "handoff", data: {}, strikes: 0 } as BotSession, lastWamid: "old", updatedAt: "2026-11-17T04:00:00Z" });
    const r = await processGuestMessage(msg({ wamid: "w9" }), w.deps);
    assert.equal(r.ran, true);
    assert.equal(w.sessions.get("c1")?.session.step, "menu");
  });
});

describe("when sending is not possible", () => {
  it("a number that can't show buttons gets the same words as text", async () => {
    const w = world({ sendInteractive: () => ({ error: "Interactive messages are not supported" }) });
    const r = await processGuestMessage(msg(), w.deps);
    assert.equal(r.sent, 1);
    assert.equal(w.interactives.length, 0);
    assert.match(w.texts[0], /• Book a room/);
  });

  it("when the 24-hour window is closed it stops and does not retry as text", async () => {
    const w = world({ sendInteractive: () => ({ error: "The 24-hour reply window has closed." }) });
    const r = await processGuestMessage(msg(), w.deps);
    assert.deepEqual(r, { ran: true, sent: 0 });
    assert.equal(w.texts.length, 0);
  });

  it("an unexpected error in the engine is logged and does not break the webhook", async () => {
    const w = world();
    const base = w.deps.account;
    w.deps.account = async (id) => {
      const a = await base(id);
      return a && { ...a, api: { ...a.api, lookup: async () => { throw new Error("boom"); } } };
    };
    const r = await processGuestMessage(msg(), w.deps);
    assert.deepEqual(r, { ran: false, reason: "error" });
    assert.match(w.logs[0], /boom/);
  });
});
