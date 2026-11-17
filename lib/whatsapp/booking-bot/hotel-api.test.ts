import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, it } from "node:test";
import { makeHotelApi, signRequest } from "./hotel-api";

const KEY = "service-role-key-for-tests";
const URL = "https://elegant-suite.com/api/bot/booking";
const NOW = 1_800_000_000_000;

/** The hotel's own check (app/api/bot/booking/route.ts), copied here so a signing mismatch fails a test, not a guest. */
function hotelAccepts(raw: string, ts: string, sig: string, nowMs: number) {
  if (!/^\d{10,13}$/.test(ts) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  if (Math.abs(nowMs - Number(ts)) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", KEY).update(`${ts}.${raw}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

type Seen = { body: Record<string, unknown>; ok: boolean };
function fakeHotel(answer: (body: Record<string, unknown>) => { status: number; json: unknown }, seen: Seen[] = []): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    assert.equal(String(url), URL);
    const raw = String(init?.body);
    const h = init?.headers as Record<string, string>;
    const ok = hotelAccepts(raw, h["x-portal-ts"], h["x-portal-signature"], NOW);
    const body = JSON.parse(raw) as Record<string, unknown>;
    seen.push({ body, ok });
    if (!ok) return new Response(JSON.stringify({ success: false, error: "Unauthorised." }), { status: 401 });
    const a = answer(body);
    return new Response(JSON.stringify(a.json), { status: a.status });
  }) as typeof fetch;
}
const api = (f: typeof fetch) => makeHotelApi({ url: URL, key: KEY, fetchImpl: f, nowMs: () => NOW });

describe("signing", () => {
  it("is the same HMAC the hotel checks", () => {
    const body = '{"action":"lookup"}';
    assert.ok(hotelAccepts(body, String(NOW), signRequest(KEY, String(NOW), body), NOW));
    assert.ok(!hotelAccepts(body, String(NOW), signRequest("another-key", String(NOW), body), NOW));
    assert.ok(!hotelAccepts(body + " ", String(NOW), signRequest(KEY, String(NOW), body), NOW));
  });
});

describe("hotel API client", () => {
  it("every call is accepted by the hotel's signature check", async () => {
    const seen: Seen[] = [];
    const a = api(fakeHotel(() => ({ status: 200, json: { success: true, bookings: [] } }), seen));
    await a.lookup("923001234567");
    assert.deepEqual(seen.map((s) => s.ok), [true]);
  });

  it("a wrong key is refused by the hotel and reported, not hidden", async () => {
    const seen: Seen[] = [];
    const bad = makeHotelApi({ url: URL, key: "wrong", fetchImpl: fakeHotel(() => ({ status: 200, json: { success: true } }), seen), nowMs: () => NOW });
    const r = await bad.lookup("923001234567");
    assert.equal(r.ok, false);
    assert.equal(seen[0].ok, false);
  });

  it("lookup sends the phone and the quoted ref", async () => {
    const seen: Seen[] = [];
    const a = api(fakeHotel(() => ({ status: 200, json: { success: true, bookings: [{ bookingRef: "HE-AAA111" }] } }), seen));
    const r = await a.lookup("923001234567", "HE-AAA111");
    assert.deepEqual(seen[0].body, { action: "lookup", guestPhone: "923001234567", bookingRef: "HE-AAA111" });
    assert.ok(r.ok && r.bookings.length === 1);
  });

  it("quote maps the hotel's rooms to what the bot shows (total with tax, per night)", async () => {
    const a = api(fakeHotel(() => ({
      status: 200,
      json: { success: true, nights: 2, rooms: [{ roomId: "r1", name: "King Room", available: true, nights: 2, grandTotal: 17001, refundable: true, requiresAdvance: false, pricePerNight: 7000 }] },
    })));
    const r = await a.quote({ checkIn: "2026-12-05", checkOut: "2026-12-07", adults: 2, children: 0 });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.rooms[0].total, 17001);
      assert.equal(r.rooms[0].perNight, 8501); // 17,001 / 2 nights, tax included (not the pre-tax rate)
      assert.equal(r.rooms[0].preTax, 14000); // the hotel's own pre-tax rate x 2 nights, as its website shows it
      assert.equal(r.rooms[0].available, true);
    }
  });

  it("create sends the guest's ad source and the additional-room flag, and returns the ref", async () => {
    const seen: Seen[] = [];
    const a = api(fakeHotel(() => ({ status: 200, json: { success: true, bookingRef: "HE-NEW123", grandTotal: 17000, roomName: "King Room" } }), seen));
    const r = await a.create({ roomId: "r1", checkIn: "2026-12-05", checkOut: "2026-12-07", adults: 2, children: 0, guestName: "Ali Raza", guestPhone: "923001234567", ref: { src: "FB", code: "EFC1" }, allowAdditional: true });
    assert.deepEqual(r, { ok: true, bookingRef: "HE-NEW123", grandTotal: 17000, roomName: "King Room" });
    assert.deepEqual(seen[0].body.ref, { src: "FB", code: "EFC1" });
    assert.equal(seen[0].body.allowAdditional, true);
  });

  it("a duplicate answer keeps the existing bookings so the bot can show them", async () => {
    const a = api(fakeHotel(() => ({ status: 409, json: { success: false, error: "duplicate", existing: [{ bookingRef: "HE-AAA111" }] } })));
    const r = await a.create({ roomId: "r1", checkIn: "2026-12-05", checkOut: "2026-12-07", adults: 2, children: 0, guestName: "Ali", guestPhone: "923001234567", ref: null, allowAdditional: false });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error, "duplicate");
      assert.equal(r.existing?.length, 1);
    }
  });

  it("a created booking without a ref is an error, never a silent success", async () => {
    const a = api(fakeHotel(() => ({ status: 200, json: { success: true } })));
    const r = await a.create({ roomId: "r1", checkIn: "2026-12-05", checkOut: "2026-12-07", adults: 2, children: 0, guestName: "Ali", guestPhone: "923001234567", ref: null, allowAdditional: false });
    assert.equal(r.ok, false);
  });

  it("network failure and server errors come back as { ok: false }", async () => {
    const boom = makeHotelApi({ url: URL, key: KEY, fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch, nowMs: () => NOW });
    assert.deepEqual(await boom.lookup("1"), { ok: false, error: "offline" });
    const err = api(fakeHotel(() => ({ status: 500, json: {} })));
    const r = await err.cancel("HE-AAA111", "923001234567");
    assert.equal(r.ok, false);
  });

  it("attach_receipt and cancel send the guest's phone with the ref", async () => {
    const seen: Seen[] = [];
    const a = api(fakeHotel(() => ({ status: 200, json: { success: true } }), seen));
    await a.attachReceipt("HE-AAA111", "923001234567", "https://adsbyshoaib.com/x");
    await a.cancel("HE-AAA111", "923001234567");
    assert.deepEqual(seen.map((s) => s.body.action), ["attach_receipt", "cancel"]);
    assert.equal(seen[0].body.receiptUrl, "https://adsbyshoaib.com/x");
    assert.equal(seen[1].body.guestPhone, "923001234567");
  });
});
