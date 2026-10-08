import "server-only";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { db } from "./dashboard/db";
import { decryptField } from "./api-vault-crypto";

/**
 * Website bookings read LIVE from each hotel's own database (Silver Sand
 * and Elegant each run their own Supabase), plus the bookings staff mark
 * from WhatsApp chats — one list per business for the portal and my
 * dashboard. Read-only: only SELECTs ever run against a hotel database.
 * Cached for a minute so page loads don't hit the hotel DB every click.
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
  /** Ad source when known: "FB-SFC1", "Google Ads", … */
  source: string | null;
  created_at: string;
};

const DAYS = 60;

function adSourceFromUtm(r: { utm_source?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null }) {
  if (r.gclid || /google/i.test(r.utm_source ?? "")) return `GA${r.utm_content ? `-${r.utm_content}` : ""}`;
  if (r.fbclid || /facebook|instagram|fb|ig|meta/i.test(r.utm_source ?? "")) return `FB${r.utm_content ? `-${r.utm_content}` : ""}`;
  return null;
}

async function websiteBookingsUncached(projectId: string): Promise<{ rows: BookingRow[]; error?: string } | null> {
  const { data: src } = await db
    .from("project_booking_sources")
    .select("kind, supabase_url, key_enc")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!src) return null;

  const hotel = createClient(src.supabase_url, decryptField(src.key_enc), { auth: { persistSession: false } });
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();

  if (src.kind === "elegant") {
    const { data, error } = await hotel
      .from("bookings")
      .select("booking_ref, guest_name, check_in, nights, grand_total, status, source, utm_source, utm_content, gclid, fbclid, created_at, rooms(name)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
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

  // silver_sand — attribution columns arrive with its migration-phase17;
  // until that has run, fall back to the plain columns.
  const base = "booking_ref, guest_name, room_name, check_in, nights, total, status, source, created_at";
  let res = await hotel
    .from("bookings")
    .select(`${base}, ref_code, utm_source, utm_content, gclid, fbclid`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (res.error && /column/i.test(res.error.message)) {
    res = (await hotel.from("bookings").select(base).gte("created_at", since).order("created_at", { ascending: false }).limit(300)) as typeof res;
  }
  if (res.error) return { rows: [], error: res.error.message };
  return {
    rows: (res.data ?? []).map((b) => {
      const r = b as typeof b & { ref_code?: string | null; utm_source?: string | null; utm_content?: string | null; gclid?: string | null; fbclid?: string | null };
      const ref = r.ref_code && !/^WEB$/.test(r.ref_code) ? r.ref_code : null;
      return {
        ref: r.booking_ref,
        channel: (r.source ?? "website") as BookingRow["channel"],
        guest: r.guest_name,
        room: r.room_name,
        check_in: r.check_in,
        nights: r.nights,
        amount: Number(r.total),
        status: r.status ?? "pending",
        source: ref ?? adSourceFromUtm(r),
        created_at: r.created_at,
      };
    }),
  };
}

const websiteBookings = (projectId: string) =>
  unstable_cache(() => websiteBookingsUncached(projectId), ["hotel-bookings", projectId], { revalidate: 60 })();

async function whatsappBookings(projectId: string): Promise<BookingRow[]> {
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
    .limit(300);
  return (data ?? []).map((c) => {
    const b = (c.booking ?? {}) as { room?: string; check_in?: string; nights?: number; amount?: number; booked_at?: string };
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
      created_at: b.booked_at ?? c.last_message_at ?? c.created_at,
    };
  });
}

/** Website + WhatsApp bookings for one business, newest first. */
export async function projectBookings(projectId: string) {
  const [site, wa] = await Promise.all([
    websiteBookings(projectId).catch((e: unknown) => ({ rows: [] as BookingRow[], error: e instanceof Error ? e.message : String(e) })),
    whatsappBookings(projectId),
  ]);
  const rows = [...(site?.rows ?? []), ...wa].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { rows, connected: site !== null, error: site && "error" in site ? site.error : undefined };
}
