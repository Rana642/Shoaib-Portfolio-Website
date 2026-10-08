import "server-only";
import { createClient } from "@supabase/supabase-js";
import { db } from "./dashboard/db";
import { decryptField } from "./api-vault-crypto";
import { adSourceFromUtm } from "./hotel-bookings";

/**
 * Inquiries + Contacts from each hotel's own database, for the portal and my
 * dashboard — the same sections the hotel admins have.
 *
 * Inquiries: status changes write back to the hotel DB ("converted" is NOT
 * set here — Convert opens the hotel admin's prefilled New Booking form, so
 * the room is blocked and the hotel's own conversion logic / Meta signal
 * runs when the booking is saved). Silver Sand also gets an Activity Log row.
 * Contacts: every guest who booked or inquired, merged by phone number.
 */

type Kind = "silver_sand" | "elegant";

async function hotel(projectId: string) {
  const { data: src } = await db
    .from("project_booking_sources")
    .select("kind, supabase_url, key_enc, site_url")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!src) return null;
  return {
    kind: src.kind as Kind,
    siteUrl: (src.site_url as string | null) ?? null,
    client: createClient(src.supabase_url, decryptField(src.key_enc), { auth: { persistSession: false } }),
  };
}

export const INQUIRY_STATUSES: Record<Kind, string[]> = {
  silver_sand: ["new", "contacted", "converted", "closed"],
  elegant: ["new", "converted", "closed", "spam"],
};

export type Inquiry = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** Elegant: which button (whatsapp / call); Silver Sand: the form source. */
  channel: string | null;
  intent: string | null;
  room: string | null;
  check_in: string | null;
  check_out: string | null;
  message: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  booking_id: string | null;
  created_at: string;
};

export async function listHotelInquiries(projectId: string) {
  const h = await hotel(projectId);
  if (!h) return null;
  const { data, error } = await h.client.from("inquiries").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return { kind: h.kind, siteUrl: h.siteUrl, rows: [] as Inquiry[], error: error.message };
  const rows: Inquiry[] = (data ?? []).map((q) =>
    h.kind === "elegant"
      ? {
          id: q.id,
          name: q.guest_name,
          phone: q.guest_phone,
          email: q.guest_email,
          channel: q.preferred_channel,
          intent: q.intent,
          room: null,
          check_in: q.check_in,
          check_out: q.check_out,
          message: null,
          status: q.status,
          source: adSourceFromUtm(q),
          notes: q.notes,
          booking_id: q.booking_id,
          created_at: q.created_at,
        }
      : {
          id: q.id,
          name: q.name,
          phone: q.phone,
          email: q.email,
          channel: q.source,
          intent: null,
          room: q.room_interest,
          check_in: q.check_in,
          check_out: q.check_out,
          message: q.message,
          status: q.status,
          source: null,
          notes: null,
          booking_id: null,
          created_at: q.created_at,
        }
  );
  return { kind: h.kind, siteUrl: h.siteUrl, rows };
}

/** The hotel admin's New Booking form, prefilled from an inquiry (Convert). */
export function convertUrl(kind: Kind, siteUrl: string, q: Inquiry) {
  const p = new URLSearchParams();
  if (kind === "elegant") {
    p.set("from_inquiry", q.id);
    p.set("name", q.name);
    if (q.phone) p.set("phone", q.phone);
    if (q.check_in) p.set("check_in", q.check_in);
    if (q.check_out) p.set("check_out", q.check_out);
    if (q.channel) p.set("channel", q.channel);
  } else {
    p.set("inquiryId", q.id);
    p.set("name", q.name);
    if (q.phone) p.set("phone", q.phone);
    if (q.email) p.set("email", q.email);
    if (q.check_in) p.set("checkIn", q.check_in);
    if (q.check_out) p.set("checkOut", q.check_out);
    if (q.room) p.set("room", q.room);
  }
  return `${siteUrl.replace(/\/$/, "")}/admin/bookings/new?${p.toString()}`;
}

/** Status (and Elegant's remark). NOT a server action — callers check access. */
export async function setHotelInquiryStatus(projectId: string, id: string, status: string, by: string, notes?: string) {
  const h = await hotel(projectId);
  if (!h) return { error: "Not connected." };
  if (status === "converted") return { error: "Use Convert — it opens the hotel's booking form so the room is blocked." };
  if (!INQUIRY_STATUSES[h.kind].includes(status)) return { error: "Unknown status." };
  const update: Record<string, unknown> = { status };
  if (h.kind === "elegant" && notes !== undefined) update.notes = notes.trim().slice(0, 500);
  const { error } = await h.client.from("inquiries").update(update).eq("id", id);
  if (error) return { error: error.message };
  if (h.kind === "silver_sand") {
    await h.client.from("activity_log").insert({ user_email: by, action: "inquiry.status", entity: "inquiry", entity_id: id, detail: `→ ${status} (client portal)` });
  }
  return { ok: true };
}

export type Contact = {
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  bookings: number;
  inquiries: number;
  lastStay: string | null;
  totalSpent: number;
  lastActivity: string;
};

/** "0317-333 0998", "+92 317 3330998" → "923173330998" so they merge. */
function phoneKey(raw: string | null) {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.startsWith("92") ? d : d.startsWith("0") ? `92${d.slice(1)}` : d;
}

export async function listHotelContacts(projectId: string): Promise<Contact[] | null> {
  const h = await hotel(projectId);
  if (!h) return null;
  const elegant = h.kind === "elegant";
  const [{ data: bookings }, { data: inquiries }] = await Promise.all([
    h.client.from("bookings").select(`guest_name, guest_phone, guest_email, check_in, created_at, status, ${elegant ? "grand_total" : "total"}`),
    h.client.from("inquiries").select(elegant ? "guest_name, guest_phone, guest_email, created_at" : "name, phone, email, created_at"),
  ]);

  type Row = { name: string; phone: string | null; email: string | null; created_at: string; booking: boolean; check_in?: string; amount?: number; status?: string };
  const rows: Row[] = [
    ...((bookings ?? []) as unknown as Record<string, unknown>[]).map((b) => ({
      name: b.guest_name as string,
      phone: b.guest_phone as string | null,
      email: b.guest_email as string | null,
      created_at: b.created_at as string,
      booking: true,
      check_in: b.check_in as string,
      amount: Number(elegant ? b.grand_total : b.total) || 0,
      status: b.status as string,
    })),
    ...((inquiries ?? []) as unknown as Record<string, unknown>[]).map((q) => ({
      name: (elegant ? q.guest_name : q.name) as string,
      phone: (elegant ? q.guest_phone : q.phone) as string | null,
      email: (elegant ? q.guest_email : q.email) as string | null,
      created_at: q.created_at as string,
      booking: false,
    })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest first → latest details win

  const map = new Map<string, Contact>();
  for (const r of rows) {
    const key = phoneKey(r.phone) ?? (r.email ? `e:${r.email.toLowerCase()}` : `n:${(r.name ?? "").toLowerCase()}`);
    const c = map.get(key) ?? { key, name: r.name, phone: r.phone, email: r.email, bookings: 0, inquiries: 0, lastStay: null, totalSpent: 0, lastActivity: r.created_at };
    c.name = r.name || c.name;
    c.phone = r.phone || c.phone;
    c.email = r.email || c.email;
    c.lastActivity = r.created_at;
    if (r.booking) {
      c.bookings += 1;
      if (r.check_in && (!c.lastStay || r.check_in > c.lastStay)) c.lastStay = r.check_in;
      if (r.status !== "cancelled" && r.status !== "no_show") c.totalSpent += r.amount ?? 0;
    } else c.inquiries += 1;
    map.set(key, c);
  }
  return [...map.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}
