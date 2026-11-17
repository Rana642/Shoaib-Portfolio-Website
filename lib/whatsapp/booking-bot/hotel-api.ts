// The hotel's booking API (Elegant: POST <site>/api/bot/booking), as the bot's engine needs it.
// Every call is signed like the portal hooks: x-portal-ts + x-portal-signature = HMAC-SHA256(`${ts}.${body}`) keyed by the
// hotel's service key, which the dashboard already holds (encrypted) to read bookings. Prices, availability and the booking
// itself are always decided by the hotel's own code; this file only asks and maps the answers.

import { createHmac } from "node:crypto";
import type { ActiveBooking, ApiFail, HotelApi, RoomOption } from "./engine";

type Env = { url: string; key: string; fetchImpl?: typeof fetch; nowMs?: () => number; timeoutMs?: number };

type Raw = {
  success?: boolean;
  error?: string;
  existing?: ActiveBooking[];
  bookings?: ActiveBooking[];
  nights?: number;
  rooms?: { roomId: string; name: string; available: boolean; reason?: string; nights: number; grandTotal: number; pricePerNight?: number; refundable: boolean; requiresAdvance: boolean }[];
  bookingRef?: string;
  grandTotal?: number | null;
  roomName?: string | null;
};

export function signRequest(key: string, ts: string, body: string): string {
  return createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
}

export function makeHotelApi(env: Env): HotelApi {
  const doFetch = env.fetchImpl ?? fetch;
  const now = env.nowMs ?? Date.now;

  async function call(payload: Record<string, unknown>): Promise<{ ok: true; data: Raw } | ApiFail> {
    const body = JSON.stringify(payload);
    const ts = String(now());
    try {
      const res = await doFetch(env.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-ts": ts, "x-portal-signature": signRequest(env.key, ts, body) },
        body,
        signal: AbortSignal.timeout(env.timeoutMs ?? 20_000),
      });
      const data = (await res.json().catch(() => ({}))) as Raw;
      if (res.ok && data.success) return { ok: true, data };
      return { ok: false, error: data.error ?? `Hotel server answered ${res.status}`, ...(data.existing ? { existing: data.existing } : {}) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not reach the hotel" };
    }
  }

  return {
    async lookup(phone, ref) {
      const r = await call({ action: "lookup", guestPhone: phone, ...(ref ? { bookingRef: ref } : {}) });
      return r.ok ? { ok: true, bookings: r.data.bookings ?? [] } : r;
    },
    async quote(i) {
      const r = await call({ action: "quote", ...i });
      if (!r.ok) return r;
      const rooms = (r.data.rooms ?? []).map((x): RoomOption & { available: boolean; reason?: string } => ({
        roomId: x.roomId,
        name: x.name,
        total: x.grandTotal,
        perNight: Math.round(x.grandTotal / Math.max(1, x.nights)),
        // The hotel's rate before tax, as its website shows it (the tax is the difference to `total`).
        ...(typeof x.pricePerNight === "number" && x.pricePerNight > 0 ? { preTax: Math.round(x.pricePerNight * x.nights) } : {}),
        nights: x.nights,
        refundable: x.refundable,
        requiresAdvance: x.requiresAdvance,
        available: x.available,
        reason: x.reason,
      }));
      return { ok: true, nights: r.data.nights ?? 0, rooms };
    },
    async create(i) {
      const r = await call({
        action: "create",
        roomId: i.roomId,
        checkIn: i.checkIn,
        checkOut: i.checkOut,
        adults: i.adults,
        children: i.children,
        guestName: i.guestName,
        guestPhone: i.guestPhone,
        ref: i.ref ? { src: i.ref.src, code: i.ref.code ?? "" } : undefined,
        allowAdditional: i.allowAdditional,
      });
      if (!r.ok) return r;
      if (!r.data.bookingRef) return { ok: false, error: "The hotel did not return a booking reference." };
      return { ok: true, bookingRef: r.data.bookingRef, grandTotal: r.data.grandTotal ?? null, roomName: r.data.roomName ?? null };
    },
    async attachReceipt(ref, phone, url) {
      const r = await call({ action: "attach_receipt", bookingRef: ref, guestPhone: phone, receiptUrl: url });
      return r.ok ? { ok: true } : r;
    },
    async cancel(ref, phone) {
      const r = await call({ action: "cancel", bookingRef: ref, guestPhone: phone });
      return r.ok ? { ok: true } : r;
    },
  };
}
