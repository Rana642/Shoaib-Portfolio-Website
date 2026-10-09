import "server-only";
import { createHmac } from "node:crypto";
import { db } from "../dashboard/db";
import { decryptField } from "../api-vault-crypto";

/**
 * WhatsApp phase 5 — feed real WhatsApp bookings back to Meta.
 *
 * A chat marked "Booked" sends ONE Meta Purchase through the hotel site's own
 * pixel (hook: /api/portal/whatsapp-purchase on each hotel repo), unless the
 * booking was also entered in the hotel admin (hotel_ref filled): the hotel's
 * own booking flow already sent its Purchase then, and a second would double
 * count. Signed with the hotel's service key, which the portal already holds
 * encrypted for reading bookings. Best-effort: the result is stored on the
 * chat, never blocks the save.
 */
export async function sendWhatsAppPurchase(contactId: string) {
  const { data: c } = await db
    .from("wa_contacts")
    .select("id, wa_id, name, booking, conversion_sent_at, wa_accounts(project_id)")
    .eq("id", contactId)
    .single();
  if (!c || c.conversion_sent_at) return { skipped: "already sent" };
  const b = (c.booking ?? {}) as { amount?: number; room?: string; hotel_ref?: string; booked_at?: string };
  if (b.hotel_ref) return { skipped: "entered in hotel admin — the hotel already sent its Purchase" };
  if (!(Number(b.amount) > 0)) return { skipped: "no amount yet" };

  const projectId = (c.wa_accounts as unknown as { project_id: string | null } | null)?.project_id;
  if (!projectId) return { skipped: "number not linked to a business" };
  const { data: src } = await db.from("project_booking_sources").select("key_enc, site_url").eq("project_id", projectId).maybeSingle();
  if (!src?.site_url) return { skipped: "hotel site not connected" };

  const body = JSON.stringify({
    eventId: `wa-booking-${c.id}`,
    phone: `+${c.wa_id}`,
    name: c.name ?? "",
    value: Number(b.amount),
    contentName: b.room || "Hotel Room",
    eventTime: b.booked_at ? Date.parse(b.booked_at) : Date.now(),
  });
  const ts = String(Date.now());
  const sig = createHmac("sha256", decryptField(src.key_enc)).update(`${ts}.${body}`).digest("hex");

  let result: string;
  try {
    const res = await fetch(`${String(src.site_url).replace(/\/$/, "")}/api/portal/whatsapp-purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-portal-ts": ts, "x-portal-signature": sig },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    result = res.ok ? "sent" : `failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`;
  } catch (error) {
    result = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  await db
    .from("wa_contacts")
    .update({ conversion_result: result, ...(result === "sent" ? { conversion_sent_at: new Date().toISOString() } : {}) })
    .eq("id", c.id);
  return { result };
}
