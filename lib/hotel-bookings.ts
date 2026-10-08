import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { db } from "./dashboard/db";
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
  ref: string;
  channel: "website" | "whatsapp" | "phone" | "walkin" | "ota";
  guest: string;
  room: string | null;
  check_in: string | null;
  nights: number | null;
  amount: number | null;
  status: string;
  /** Ad source when known: "FB-SFC1", "GA-SGN", "GS", "WEB" … */
  source: string | null;
  /** True when staff set the source by hand. */
  sourceSet?: boolean;
  created_at: string;
};

export type Range = { since: string; until?: string };

export const CONFIRMED_STATUSES = new Set(["confirmed", "checked_in", "completed"]);
export const LOST_STATUSES = new Set(["cancelled", "no_show"]);

/** Last `days` days, for the Bookings tab. */
export const lastDays = (days: number): Range => ({ since: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString() });

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
        .select("booking_ref, guest_name, check_in, nights, grand_total, status, source, utm_source, utm_content, gclid, fbclid, created_at, rooms(name)")
    )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { rows: [], error: error.message };
    return {
      rows: (data ?? []).map((b) => ({
        ref: b.booking_ref,
        channel: (b.source ?? "website") as BookingRow["channel"],
        guest: b.guest_name,
        room: (b.rooms as unknown as { name: string } | null)?.name ?? null,
        check_in: b.check_in,
        nights: b.nights,
        amount: Number(b.grand_total),
        status: b.status ?? "pending",
        source: adSourceFromUtm(b),
        created_at: b.created_at,
      })),
    };
  }

  // silver_sand — attribution columns came with its migration-phase17;
  // keep a fallback in case a hotel DB is ever restored without them.
  const base = "booking_ref, guest_name, room_name, check_in, nights, total, status, source, created_at";
  let res = await scoped(hotel.from("bookings").select(`${base}, ref_code, utm_source, utm_content, gclid, fbclid`))
    .order("created_at", { ascending: false })
    .limit(500);
  if (res.error && /column/i.test(res.error.message)) {
    res = (await scoped(hotel.from("bookings").select(base)).order("created_at", { ascending: false }).limit(500)) as typeof res;
  }
  if (res.error) return { rows: [], error: res.error.message };
  return {
    rows: (res.data ?? []).map((b) => {
      const r = b as typeof b & { ref_code?: string | null; utm_source?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null };
      return {
        ref: r.booking_ref,
        channel: (r.source ?? "website") as BookingRow["channel"],
        guest: r.guest_name,
        room: r.room_name,
        check_in: r.check_in,
        nights: r.nights,
        amount: Number(r.total),
        status: r.status ?? "pending",
        source: r.ref_code || adSourceFromUtm(r),
        created_at: r.created_at,
      };
    }),
  };
}

const websiteBookings = (projectId: string, range: Range) =>
  unstable_cache(() => websiteBookingsUncached(projectId, range), ["hotel-bookings", projectId, range.since.slice(0, 13), range.until ?? ""], {
    revalidate: 60,
  })();

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
    .limit(500);
  return (data ?? [])
    .map((c) => {
      const b = (c.booking ?? {}) as { room?: string; check_in?: string; nights?: number; amount?: number; booked_at?: string; hotel_ref?: string };
      return {
        ref: `WA-${String(c.id).slice(0, 6).toUpperCase()}`,
        channel: "whatsapp" as const,
        guest: c.name || `+${c.wa_id}`,
        room: b.room ?? null,
        check_in: b.check_in ?? null,
        nights: b.nights ?? null,
        amount: b.amount ?? null,
        status: "confirmed",
        source: c.ref_source ? `${c.ref_source}${c.ref_code ? `-${c.ref_code}` : ""}` : null,
        created_at: (b.booked_at ?? c.last_message_at ?? c.created_at) as string,
        hotelRef: b.hotel_ref?.trim().toUpperCase() || null,
      };
    })
    .filter((r) => r.created_at >= range.since && (!range.until || r.created_at <= range.until));
}

/** Website + WhatsApp bookings for one business, newest first. */
export async function projectBookings(projectId: string, range: Range = lastDays(60)) {
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
      if (!match.source && w.source) match.source = w.source;
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
