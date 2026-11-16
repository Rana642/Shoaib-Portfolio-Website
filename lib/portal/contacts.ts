import "server-only";
import { db } from "@/lib/dashboard/db";
import { listHotelContacts } from "@/lib/hotel-crm";
import {
  applyToStored,
  numberKeyOf,
  fromWebsite,
  fromWhatsApp,
  mergeCandidates,
  type Candidate,
  type ContactSource,
  type StoredContact,
} from "./contacts-merge";

export type PortalContact = {
  id: string;
  contact_key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  sources: ContactSource[];
  notes: string | null;
  bookings: number;
  inquiries: number;
  chats: number;
  total_spent: number;
  first_seen_at: string;
  last_activity_at: string | null;
};

const COLUMNS = "id, contact_key, name, phone, email, sources, notes, bookings, inquiries, chats, total_spent, first_seen_at, last_activity_at";
const PAGE = 1000;

/** Every WhatsApp chat of a business's numbers (paged, because a number can have thousands). */
async function whatsAppRows(projectId: string) {
  const { data: accounts } = await db.from("wa_accounts").select("id").eq("project_id", projectId);
  const ids = (accounts ?? []).map((a) => a.id as string);
  const rows: { wa_id: string; name: string | null; created_at: string; last_message_at: string | null }[] = [];
  if (!ids.length) return rows;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await db
      .from("wa_contacts")
      .select("wa_id, name, created_at, last_message_at")
      .in("account_id", ids)
      .order("created_at")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

/**
 * Brings one business's contact book up to date from the hotel website (bookings, inquiries) and WhatsApp
 * (every chat). People are never removed and notes are never touched; people added by hand keep what was typed.
 */
export async function syncProjectContacts(projectId: string): Promise<number> {
  // A failed website read stops the sync: carrying on would write zero bookings over guests who also chat on WhatsApp.
  const [website, chats, { data: storedRows, error: storedError }] = await Promise.all([
    listHotelContacts(projectId),
    whatsAppRows(projectId),
    db.from("portal_contacts").select("contact_key, name, phone, email, sources, first_seen_at").eq("project_id", projectId),
  ]);
  if (storedError) throw new Error(storedError.message);
  const stored = new Map(((storedRows ?? []) as (StoredContact & { first_seen_at: string })[]).map((s) => [s.contact_key, s]));
  const merged: Candidate[] = mergeCandidates([...fromWebsite(website ?? []), ...fromWhatsApp(chats)]);
  if (!merged.length) return 0;

  const now = new Date().toISOString();
  const rows = merged.map((c) => {
    const have = stored.get(c.key);
    const out = applyToStored(c, have);
    // first_seen_at is always sent: rows in one upsert batch must have the same columns, and it can't be null.
    const firstSeen = [out.firstSeen, have?.first_seen_at].filter((v): v is string => !!v).sort()[0] ?? now;
    return {
      project_id: projectId,
      contact_key: out.key,
      name: out.name,
      phone: out.phone,
      email: out.email,
      sources: out.sources,
      bookings: out.bookings,
      inquiries: out.inquiries,
      chats: out.chats,
      total_spent: out.totalSpent,
      first_seen_at: firstSeen,
      last_activity_at: out.lastActivity,
      updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("portal_contacts").upsert(rows.slice(i, i + 500), { onConflict: "project_id,contact_key" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Every business that has a website CRM or a WhatsApp number (the half-hourly sync). Errors in one don't stop the rest. */
export async function syncAllProjectContacts(): Promise<{ projects: number; failed: number }> {
  const [{ data: sources }, { data: accounts }] = await Promise.all([
    db.from("project_booking_sources").select("project_id"),
    db.from("wa_accounts").select("project_id").not("project_id", "is", null),
  ]);
  const ids = [...new Set([...(sources ?? []), ...(accounts ?? [])].map((r) => r.project_id as string))];
  let failed = 0;
  for (const id of ids) {
    try {
      await syncProjectContacts(id);
    } catch {
      failed++;
    }
  }
  return { projects: ids.length, failed };
}

/** What a typed search may contain: letters, digits, spaces and a few marks. Anything that could change a filter's meaning is dropped. */
export function safeSearch(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N}\s+@._-]/gu, "").trim().slice(0, 60);
}

export const CONTACTS_PAGE_SIZE = 50;
const SOURCE_KEYS = ["website_booking", "website_inquiry", "whatsapp", "manual"];

export async function listContacts(
  projectId: string,
  opts: { q?: string; source?: string; page?: number }
): Promise<{ rows: PortalContact[]; total: number; page: number }> {
  const q = safeSearch(opts.q);
  const key = q ? numberKeyOf(q) : null;
  const orFilter = q ? `name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%${key ? `,contact_key.ilike.%${key}%` : ""}` : null;
  const source = opts.source && SOURCE_KEYS.includes(opts.source) ? opts.source : null;

  let countQuery = db.from("portal_contacts").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  if (orFilter) countQuery = countQuery.or(orFilter);
  if (source) countQuery = countQuery.contains("sources", [source]);
  const { count } = await countQuery;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1)), pages);
  const from = (page - 1) * CONTACTS_PAGE_SIZE;

  let dataQuery = db.from("portal_contacts").select(COLUMNS).eq("project_id", projectId);
  if (orFilter) dataQuery = dataQuery.or(orFilter);
  if (source) dataQuery = dataQuery.contains("sources", [source]);
  const { data } = await dataQuery
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("id")
    .range(from, from + CONTACTS_PAGE_SIZE - 1);
  return { rows: (data ?? []) as unknown as PortalContact[], total, page };
}

/** The sync, unless this business's book was refreshed a moment ago (so opening the page again and again costs nothing). */
export async function syncProjectContactsIfStale(projectId: string, maxAgeMs = 3 * 60 * 1000): Promise<void> {
  const { data } = await db.from("portal_contacts").select("updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1);
  const last = data?.[0]?.updated_at as string | undefined;
  if (last && Date.now() - new Date(last).getTime() < maxAgeMs) return;
  await syncProjectContacts(projectId);
}

/** Everything of a business's book, for the CSV. */
export async function allContacts(projectId: string): Promise<PortalContact[]> {
  const out: PortalContact[] = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await db
      .from("portal_contacts")
      .select(COLUMNS)
      .eq("project_id", projectId)
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as PortalContact[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}
