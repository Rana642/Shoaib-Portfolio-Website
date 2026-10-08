import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { db } from "./dashboard/db";
import { createHmac } from "node:crypto";
import { decryptField } from "./api-vault-crypto";

/**
 * Website bookings read LIVE from each hotel's own database (Silver Sand
 * and Elegant each run their own Supabase), plus the bookings staff mark
 * from WhatsApp chats — one list per business for the portal, my dashboard
 * and the monthly report. Read-only: only SELECTs ever run against a hotel
 * database. Cached for a minute so page loads don't hit it every click.
 *
 * Two things keep the numbers honest:
 *  - A WhatsApp booking that staff also entered in the hotel's admin (so the
 *    room is blocked) carries that booking's ref → counted once, and the
 *    chat's ad code becomes the hotel booking's source.
 *  - Phone / walk-in bookings have no code; staff pick a source for them
 *    (booking_source_overrides), which wins over everything.
 */

export type BookingRow = {
  /** The hotel's own booking id (detail page); absent for WhatsApp rows. */
  id?: string;
  /** WhatsApp rows: the chat, for linking back to it. */
  chatId?: string;
  phone?: string | null;
  check_out?: string | null;
  ref: string;
  channel: "website" | "whatsapp" | "phone" | "walkin" | "ota";
  guest: string;
  room: string | null;
  check_in: string | null;
  nights: number | null;
  amount: number | null;
  status: string;
  /** Where the guest came from, labelled like the Elegant admin:
   *  "Facebook Ads", "Google Ads", "Google Organic", "Meta Organic", "Direct"… */
  source: string | null;
  /** The ad / Ref code when known (utm_content or the WhatsApp Ref), e.g. "SFC1". */
  code?: string | null;
  /** True when staff set the source by hand. */
  sourceSet?: boolean;
  created_at: string;
};

export type Range = { since: string; until?: string };

export const CONFIRMED_STATUSES = new Set(["confirmed", "checked_in", "completed"]);
export const LOST_STATUSES = new Set(["cancelled", "no_show"]);

/** Last `days` days, for the Bookings tab. */
export const lastDays = (days: number): Range => ({ since: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString() });

type Attribution = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  ref_code?: string | null;
};

/**
 * The Elegant admin's own source label (app/admin/bookings/page.tsx
 * attributionLabel): ad click ids first (most reliable), then utm_source,
 * then the referrer host, else "Direct". Plus the ad code when there is one.
 */
export function sourceLabel(b: Attribution): { label: string; code: string | null } {
  const code = b.utm_content || (b.ref_code && b.ref_code.includes("-") ? b.ref_code.split("-").slice(1).join("-") : null) || null;
  const refSrc = b.ref_code?.split("-")[0];
  if (b.fbclid || refSrc === "FB") return { label: "Facebook Ads", code };
  if (b.gclid || refSrc === "GA") return { label: "Google Ads", code };
  const src = (b.utm_source || "").toLowerCase();
  if (src) {
    if (/facebook|instagram|meta|^fb$|^ig$/.test(src)) return { label: `Meta (${b.utm_medium || "unknown"})`, code };
    if (src.includes("google")) return { label: `Google (${b.utm_medium || "unknown"})`, code };
    return { label: `${b.utm_source}${b.utm_medium ? ` / ${b.utm_medium}` : ""}`, code };
  }
  const ref = (b.referrer || "").toLowerCase();
  if (ref.includes("google") || refSrc === "GS") return { label: "Google Organic", code };
  if (/facebook|fb\.com|instagram/.test(ref)) return { label: "Meta Organic", code };
  if (ref) return { label: ref, code };
  return { label: "Direct", code };
}

export function adSourceFromUtm(r: { utm_source?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null }) {
  if (r.gclid || /google/i.test(r.utm_source ?? "")) return `GA${r.utm_content ? `-${r.utm_content}` : ""}`;
  if (r.fbclid || /facebook|instagram|fb|ig|meta/i.test(r.utm_source ?? "")) return `FB${r.utm_content ? `-${r.utm_content}` : ""}`;
  return null;
}

async function websiteBookingsUncached(projectId: string, range: Range): Promise<{ rows: BookingRow[]; error?: string } | null> {
  const { data: src } = await db
    .from("project_booking_sources")
    .select("kind, supabase_url, key_enc")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!src) return null;

  const hotel = createClient(src.supabase_url, decryptField(src.key_enc), { auth: { persistSession: false } });
  const scoped = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T) =>
    range.until ? q.gte("created_at", range.since).lte("created_at", range.until) : q.gte("created_at", range.since);

  if (src.kind === "elegant") {
    const { data, error } = await scoped(
      hotel
        .from("bookings")
        .select("id, booking_ref, guest_name, guest_phone, check_in, check_out, nights, grand_total, status, source, utm_source, utm_medium, utm_content, gclid, fbclid, referrer, created_at, rooms(name)")
    )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) return { rows: [], error: error.message };
    return {
      rows: (data ?? []).map((b) => ({
        id: b.id,
        phone: b.guest_phone,
        check_out: b.check_out,
        ref: b.booking_ref,
        channel: (b.source ?? "website") as BookingRow["channel"],
        guest: b.guest_name,
        room: (b.rooms as unknown as { name: string } | null)?.name ?? null,
        check_in: b.check_in,
        nights: b.nights,
        amount: Number(b.grand_total),
        status: b.status ?? "pending",
        ...attributed(b),
        created_at: b.created_at,
      })),
    };
  }

  // silver_sand — attribution columns came with its migration-phase17;
  // keep a fallback in case a hotel DB is ever restored without them.
  const base = "id, booking_ref, guest_name, guest_phone, room_name, check_in, check_out, nights, total, status, source, created_at";
  let res = await scoped(hotel.from("bookings").select(`${base}, ref_code, utm_source, utm_medium, utm_content, gclid, fbclid, referrer`))
    .order("created_at", { ascending: false })
    .limit(5000);
  if (res.error && /column/i.test(res.error.message)) {
    res = (await scoped(hotel.from("bookings").select(base)).order("created_at", { ascending: false }).limit(5000)) as typeof res;
  }
  if (res.error) return { rows: [], error: res.error.message };
  return {
    rows: (res.data ?? []).map((b) => {
      const r = b as typeof b & { ref_code?: string | null; utm_source?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null };
      return {
        id: r.id,
        phone: r.guest_phone,
        check_out: r.check_out,
        ref: r.booking_ref,
        channel: (r.source ?? "website") as BookingRow["channel"],
        guest: r.guest_name,
        room: r.room_name,
        check_in: r.check_in,
        nights: r.nights,
        amount: Number(r.total),
        status: r.status ?? "pending",
        // Silver Sand saves its source only since migration-phase17 (8 Oct 2026).
        ...(r.created_at < SILVER_SAND_TRACKING_SINCE && !r.ref_code ? { source: "Not tracked", code: null } : attributed(r)),
        created_at: r.created_at,
      };
    }),
  };
}

const SILVER_SAND_TRACKING_SINCE = "2026-10-08T12:00:00Z";
const attributed = (b: Attribution) => {
  const s = sourceLabel(b);
  return { source: s.label, code: s.code };
};

const websiteBookings = (projectId: string, range: Range) =>
  unstable_cache(() => websiteBookingsUncached(projectId, range), ["hotel-bookings", projectId, range.since.slice(0, 13), range.until ?? ""], {
    revalidate: 60,
    tags: [bookingsTag(projectId)],
  })();

/** Cache tag for a business's booking list — cleared when staff change a status. */
export const bookingsTag = (projectId: string) => `hotel-bookings:${projectId}`;

async function whatsappBookings(projectId: string, range: Range): Promise<(BookingRow & { hotelRef: string | null })[]> {
  const { data: accounts } = await db.from("wa_accounts").select("id").eq("project_id", projectId);
  if (!accounts?.length) return [];
  const { data } = await db
    .from("wa_contacts")
    .select("id, wa_id, name, ref_source, ref_code, booking, last_message_at, created_at")
    .in(
      "account_id",
      accounts.map((a) => a.id)
    )
    .eq("status", "booked")
    .order("last_message_at", { ascending: false })
    .limit(5000);
  return (data ?? [])
    .map((c) => {
      const b = (c.booking ?? {}) as { room?: string; check_in?: string; nights?: number; amount?: number; booked_at?: string; hotel_ref?: string };
      return {
        chatId: c.id as string,
        phone: `+${c.wa_id}`,
        ref: `WA-${String(c.id).slice(0, 6).toUpperCase()}`,
        channel: "whatsapp" as const,
        guest: c.name || `+${c.wa_id}`,
        room: b.room ?? null,
        check_in: b.check_in ?? null,
        nights: b.nights ?? null,
        amount: b.amount ?? null,
        status: "confirmed",
        ...(c.ref_source ? attributed({ ref_code: `${c.ref_source}${c.ref_code ? `-${c.ref_code}` : ""}` }) : { source: "WhatsApp (no code)", code: null }),
        created_at: (b.booked_at ?? c.last_message_at ?? c.created_at) as string,
        hotelRef: b.hotel_ref?.trim().toUpperCase() || null,
      };
    })
    .filter((r) => r.created_at >= range.since && (!range.until || r.created_at <= range.until));
}

/** Website + WhatsApp bookings for one business, newest first. */
/** Every booking ever (the Bookings page); reports pass a month. */
export const ALL_TIME: Range = { since: "2000-01-01T00:00:00Z" };

export async function projectBookings(projectId: string, range: Range = ALL_TIME) {
  const [site, wa, { data: overrides }] = await Promise.all([
    websiteBookings(projectId, range).catch((e: unknown) => ({ rows: [] as BookingRow[], error: e instanceof Error ? e.message : String(e) })),
    whatsappBookings(projectId, range),
    db.from("booking_source_overrides").select("booking_ref, source").eq("project_id", projectId),
  ]);
  const siteRows = site?.rows ?? [];
  const byRef = new Map(siteRows.map((r) => [r.ref.toUpperCase(), r]));

  // A WhatsApp booking also entered in the hotel admin: one booking, the chat's source.
  const waRows: BookingRow[] = [];
  for (const w of wa) {
    const match = w.hotelRef ? byRef.get(w.hotelRef) : undefined;
    if (match) {
      if ((!match.source || match.source === "Direct" || match.source === "Not tracked") && w.source) {
        match.source = w.source;
        match.code = w.code;
      }
      continue;
    }
    const { hotelRef: _drop, ...row } = w;
    void _drop;
    waRows.push(row);
  }

  const manual = new Map((overrides ?? []).map((o) => [String(o.booking_ref).toUpperCase(), o.source as string]));
  const rows = [...siteRows, ...waRows]
    .map((r) => {
      const set = manual.get(r.ref.toUpperCase());
      return set ? { ...r, source: set, sourceSet: true } : r;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { rows, connected: site !== null, error: site && "error" in site ? site.error : undefined };
}

// ── Booking detail + status/notes (writes to the hotel's own database) ──

export const HOTEL_STATUSES = ["pending", "confirmed", "checked_in", "completed", "cancelled", "no_show", "unreachable"] as const;
export type HotelStatus = (typeof HOTEL_STATUSES)[number];

export type HotelBookingDetail = {
  id: string;
  ref: string;
  kind: "silver_sand" | "elegant";
  guest: string;
  phone: string;
  email: string | null;
  room: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  guests: string;
  status: string;
  channel: string;
  source: string | null;
  created_at: string;
  special_request: string | null;
  /** Silver Sand: admin_notes. Elegant: status_note. */
  notes: string | null;
  /** `info` lines (e.g. a deal's saving already inside the room total) don't add up. */
  charges: { label: string; amount: number; minus?: boolean; info?: boolean }[];
  total: number;
};

const withCode = (s: { label: string; code: string | null }) => (s.code ? `${s.label} · ${s.code}` : s.label);

async function hotelClient(projectId: string) {
  const { data: src } = await db
    .from("project_booking_sources")
    .select("kind, supabase_url, key_enc, site_url")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!src) return null;
  const key = decryptField(src.key_enc);
  return {
    kind: src.kind as "silver_sand" | "elegant",
    hotel: createClient(src.supabase_url, key, { auth: { persistSession: false } }),
    key,
    siteUrl: (src.site_url as string | null) ?? null,
  };
}

/**
 * Elegant only: a booking newly marked Completed → its site fires the Meta
 * StayCompleted CAPI + GA4 event, exactly like its own admin does
 * (Elegant repo: app/api/portal/booking-completed). Signed with the hotel's
 * service key, which both sides already hold. Best-effort.
 */
async function notifyCompleted(siteUrl: string, key: string, bookingId: string) {
  const ts = String(Date.now());
  const sig = createHmac("sha256", key).update(`${bookingId}.${ts}`).digest("hex");
  try {
    const res = await fetch(`${siteUrl.replace(/\/$/, "")}/api/portal/booking-completed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-portal-ts": ts, "x-portal-signature": sig },
      body: JSON.stringify({ bookingId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error("[hotel-bookings] completed hook:", res.status, await res.text().catch(() => ""));
  } catch (error) {
    console.error("[hotel-bookings] completed hook failed:", error);
  }
}

export async function getHotelBooking(projectId: string, bookingId: string): Promise<HotelBookingDetail | null> {
  const c = await hotelClient(projectId);
  if (!c) return null;
  const { data: overrides } = await db.from("booking_source_overrides").select("booking_ref, source").eq("project_id", projectId);
  const manual = new Map((overrides ?? []).map((o) => [String(o.booking_ref).toUpperCase(), o.source as string]));

  if (c.kind === "elegant") {
    const { data: b } = await c.hotel.from("bookings").select("*, rooms(name)").eq("id", bookingId).maybeSingle();
    if (!b) return null;
    // Elegant's room_total is already after the deal and includes GST + city tax.
    const charges: HotelBookingDetail["charges"] = [
      { label: `Room × ${b.nights} night${b.nights > 1 ? "s" : ""} (incl. GST & city tax)`, amount: Number(b.room_total) },
    ];
    if (Number(b.extra_bed_total) > 0) charges.push({ label: `Extra bed${b.extra_beds > 1 ? "s" : ""} × ${b.extra_beds}`, amount: Number(b.extra_bed_total) });
    if (Number(b.discount_amount) > 0) {
      charges.push({ label: `Guest saved${b.coupon_code ? ` — ${String(b.coupon_code).replace(/^DEAL:/, "")}` : ""}`, amount: Number(b.discount_amount), info: true });
    }
    return {
      id: b.id,
      ref: b.booking_ref,
      kind: "elegant",
      guest: b.guest_name,
      phone: b.guest_phone,
      email: b.guest_email,
      room: (b.rooms as { name: string } | null)?.name ?? null,
      check_in: b.check_in,
      check_out: b.check_out,
      nights: b.nights,
      guests: `${b.adults} adult${b.adults > 1 ? "s" : ""}${b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}`,
      status: b.status ?? "pending",
      channel: b.source ?? "website",
      source: manual.get(String(b.booking_ref).toUpperCase()) ?? withCode(sourceLabel(b)),
      created_at: b.created_at,
      special_request: b.special_request,
      notes: b.status_note ?? null,
      charges,
      total: Number(b.grand_total),
    };
  }

  const { data: b } = await c.hotel.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return null;
  const roomSub = Number(b.unit_price) * b.nights * (b.rooms_count || 1);
  const charges: HotelBookingDetail["charges"] = [
    { label: `Rs ${Number(b.unit_price).toLocaleString("en-PK")} × ${b.nights} night${b.nights > 1 ? "s" : ""}${b.rooms_count > 1 ? ` × ${b.rooms_count} rooms` : ""}`, amount: roomSub },
  ];
  if (Number(b.discount) > 0) charges.push({ label: `Discount${b.coupon_code ? ` (${b.coupon_code})` : ""}`, amount: Number(b.discount), minus: true });
  const gst = Number(b.total) - (roomSub - Number(b.discount || 0));
  if (gst > 0.5) charges.push({ label: "GST", amount: Math.round(gst) });
  return {
    id: b.id,
    ref: b.booking_ref,
    kind: "silver_sand",
    guest: b.guest_name,
    phone: b.guest_phone,
    email: b.guest_email,
    room: b.room_name,
    check_in: b.check_in,
    check_out: b.check_out,
    nights: b.nights,
    guests: `${b.guests} guest${b.guests > 1 ? "s" : ""} · ${b.rooms_count} room${b.rooms_count > 1 ? "s" : ""}`,
    status: b.status ?? "pending",
    channel: b.source ?? "website",
    source:
      manual.get(String(b.booking_ref).toUpperCase()) ??
      (b.created_at < SILVER_SAND_TRACKING_SINCE && !b.ref_code ? "Not tracked" : withCode(sourceLabel(b))),
    created_at: b.created_at,
    special_request: b.special_request,
    notes: b.admin_notes ?? null,
    charges,
    total: Number(b.total),
  };
}

/**
 * Change a booking's status in the hotel's own database, with the same side
 * effects the hotel admin has: cancelled / no-show frees the room
 * (availability_blocks), and Silver Sand writes its Activity Log.
 * NOT a server action — callers check access first.
 */
export async function setHotelBookingStatus(projectId: string, bookingId: string, status: string, by: string) {
  if (!(HOTEL_STATUSES as readonly string[]).includes(status)) return { error: "Unknown status." };
  const c = await hotelClient(projectId);
  if (!c) return { error: "Bookings aren't connected for this business." };
  const { data: before } = await c.hotel.from("bookings").select("status").eq("id", bookingId).maybeSingle();
  const { error } = await c.hotel.from("bookings").update({ status }).eq("id", bookingId);
  if (error) return { error: error.message };
  if (c.kind === "elegant" && status === "completed" && before?.status !== "completed" && c.siteUrl) {
    await notifyCompleted(c.siteUrl, c.key, bookingId);
  }
  const freesRoom = c.kind === "silver_sand" ? status === "cancelled" || status === "no_show" : status === "cancelled";
  if (freesRoom) await c.hotel.from("availability_blocks").delete().eq("booking_id", bookingId);
  if (c.kind === "silver_sand") {
    await c.hotel.from("activity_log").insert({ user_email: by, action: "booking.status", entity: "booking", entity_id: bookingId, detail: `→ ${status} (client portal)` });
  }
  return { ok: true };
}

export async function saveHotelBookingNotes(projectId: string, bookingId: string, notes: string, by: string) {
  const c = await hotelClient(projectId);
  if (!c) return { error: "Bookings aren't connected for this business." };
  const value = notes.trim().slice(0, 2000) || null;
  const { error } = await c.hotel.from("bookings").update(c.kind === "elegant" ? { status_note: value } : { admin_notes: value }).eq("id", bookingId);
  if (error) return { error: error.message };
  if (c.kind === "silver_sand") {
    await c.hotel.from("activity_log").insert({ user_email: by, action: "booking.notes", entity: "booking", entity_id: bookingId, detail: "(client portal)" });
  }
  return { ok: true };
}
