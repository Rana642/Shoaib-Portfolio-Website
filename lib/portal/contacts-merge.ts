// The pure part of the portal contact book: turning what each place knows about a person into one
// contact per phone number (or e-mail), without losing what was added by hand. Tested on its own.

export type ContactSource = "website_booking" | "website_inquiry" | "whatsapp" | "manual";

export const SOURCE_LABEL: Record<ContactSource, string> = {
  website_booking: "Website booking",
  website_inquiry: "Website inquiry",
  whatsapp: "WhatsApp",
  manual: "Added by hand",
};

export type Candidate = {
  key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  sources: ContactSource[];
  bookings: number;
  inquiries: number;
  chats: number;
  totalSpent: number;
  firstSeen: string | null;
  lastActivity: string | null;
};

/** "0317-333 0998", "+92 317 3330998" and "923173330998" are one number. Under 7 digits is not a number. */
export function phoneKey(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.startsWith("92") ? d : d.startsWith("0") ? `92${d.slice(1)}` : d;
}

/** The key a contact is stored under: its phone, else its e-mail, else (last resort) its name. Null when there is nothing at all. */
export function contactKey(phone: string | null | undefined, email: string | null | undefined, name?: string | null): string | null {
  const p = phoneKey(phone);
  if (p) return p;
  const e = (email ?? "").trim().toLowerCase();
  if (e) return `e:${e}`;
  const n = (name ?? "").trim().toLowerCase();
  return n ? `n:${n}` : null;
}

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
const earlier = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b));
const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/** What the hotel website's CRM knows (bookings and inquiries per person, already merged by phone there). */
export function fromWebsite(
  rows: { key: string; name: string; phone: string | null; email: string | null; bookings: number; inquiries: number; totalSpent: number; lastActivity: string }[]
): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    const key = contactKey(r.phone, r.email, r.name);
    if (!key) continue;
    const sources: ContactSource[] = [];
    if (r.bookings > 0) sources.push("website_booking");
    if (r.inquiries > 0) sources.push("website_inquiry");
    out.push({
      key,
      name: clean(r.name),
      phone: clean(r.phone),
      email: clean(r.email),
      sources: sources.length ? sources : ["website_inquiry"],
      bookings: r.bookings,
      inquiries: r.inquiries,
      chats: 0,
      totalSpent: r.totalSpent,
      firstSeen: null,
      lastActivity: r.lastActivity,
    });
  }
  return out;
}

/** What WhatsApp knows: one chat per guest number (a number may appear on several of the business's WhatsApp numbers). */
export function fromWhatsApp(rows: { wa_id: string; name: string | null; created_at: string; last_message_at: string | null }[]): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    const key = contactKey(r.wa_id, null);
    if (!key) continue;
    const digits = r.wa_id.replace(/\D/g, "");
    out.push({
      key,
      name: clean(r.name),
      phone: digits ? `+${digits}` : null,
      email: null,
      sources: ["whatsapp"],
      bookings: 0,
      inquiries: 0,
      chats: 1,
      totalSpent: 0,
      firstSeen: r.created_at,
      lastActivity: r.last_message_at ?? r.created_at,
    });
  }
  return out;
}

/**
 * One contact per key. Sources are joined; counts add up (each place reports a person once); the first
 * non-empty name, phone and e-mail win in the order the candidates were given (put the most trusted first).
 */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const c of list) {
    const have = map.get(c.key);
    if (!have) {
      map.set(c.key, { ...c, sources: [...new Set(c.sources)] });
      continue;
    }
    have.name = have.name ?? c.name;
    have.phone = have.phone ?? c.phone;
    have.email = have.email ?? c.email;
    have.sources = [...new Set([...have.sources, ...c.sources])];
    have.bookings += c.bookings;
    have.inquiries += c.inquiries;
    have.chats += c.chats;
    have.totalSpent += c.totalSpent;
    have.firstSeen = earlier(have.firstSeen, c.firstSeen);
    have.lastActivity = later(have.lastActivity, c.lastActivity);
  }
  return [...map.values()];
}

/** The digits of a typed number the way contact_key stores them (0317… and +92317… both become 92317…), or null if it isn't a number. */
export function numberKeyOf(q: string): string | null {
  const d = q.replace(/\D/g, "");
  if (d.length < 4 || d.length !== q.replace(/[\s+()-]/g, "").length) return null;
  return d.startsWith("0") ? `92${d.slice(1)}` : d;
}

export type StoredContact = { contact_key: string; name: string | null; phone: string | null; email: string | null; sources: string[] };

/**
 * What to write for a synced contact, given what is already stored: sources only grow, and a person added by
 * hand keeps the name, phone and e-mail that were typed (the notes are never part of a sync).
 */
export function applyToStored(c: Candidate, stored: StoredContact | undefined): Candidate {
  if (!stored) return c;
  const byHand = stored.sources.includes("manual");
  return {
    ...c,
    name: byHand ? (clean(stored.name) ?? c.name) : (c.name ?? clean(stored.name)),
    phone: byHand ? (clean(stored.phone) ?? c.phone) : (c.phone ?? clean(stored.phone)),
    email: byHand ? (clean(stored.email) ?? c.email) : (c.email ?? clean(stored.email)),
    sources: [...new Set([...(stored.sources as ContactSource[]), ...c.sources])],
  };
}

/** One value of a CSV file: quoted when needed, and a leading = + - @ made harmless so a spreadsheet won't run it as a formula. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  // A phone number may start with + or -; anything else starting that way could be a formula.
  const looksLikeNumber = /^[+-]?[\d\s().-]+$/.test(s);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !looksLikeNumber)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
