import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";

/**
 * WhatsApp Cloud API on the "Socially Snap" Meta app — docs/WHATSAPP-INBOX-PLAN.md.
 * Credentials live in the API Vault (service "whatsapp": app_id, app_secret,
 * access_token = never-expiring system-user token, waba_id, phone_number_id).
 *
 * Inbound messages, delivery statuses and — once a hotel number joins via
 * coexistence — the messages staff send from the phone app ("echoes") all
 * arrive at /api/whatsapp/webhook and are stored by ingestWebhook().
 */

const GRAPH = "https://graph.facebook.com/v23.0";

export async function whatsappCredential() {
  return getVaultCredential("whatsapp");
}

/**
 * The webhook verify token Meta asks for when subscribing. Derived from the
 * app secret (so no extra env var or stored secret), shown to Shoaib once
 * to paste into the app dashboard.
 */
export function verifyTokenFrom(appSecret: string) {
  return createHmac("sha256", appSecret).update("socially-snap-whatsapp-webhook").digest("hex").slice(0, 32);
}

/** Meta signs every webhook POST with the app secret (X-Hub-Signature-256). */
export function validSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "…\n\nRef: FB-SFC1" → { source: "FB", code: "SFC1" } (the website's first-touch code). */
export function parseRef(text: string | null | undefined): { source: string; code: string | null } | null {
  const m = text?.match(/Ref:\s*(GA|FB|GS|WEB)(?:-([A-Za-z0-9_]{1,16}))?/);
  return m ? { source: m[1], code: m[2] ?? null } : null;
}

type WaMessage = {
  from?: string;
  to?: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  location?: { latitude: number; longitude: number; name?: string };
  /** Click-to-WhatsApp ads: the ad the chat started from. */
  referral?: { source_type?: string; source_id?: string; headline?: string };
};

function messageText(m: WaMessage): string | null {
  return (
    m.text?.body ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    m.document?.filename ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    (m.location ? `📍 ${m.location.name ?? `${m.location.latitude},${m.location.longitude}`}` : null)
  );
}

async function accountFor(phoneNumberId: string, displayPhone?: string) {
  const { data } = await db.from("wa_accounts").select("id").eq("phone_number_id", phoneNumberId).maybeSingle();
  if (data) return data.id as string;
  const { data: created } = await db
    .from("wa_accounts")
    .upsert({ phone_number_id: phoneNumberId, display_phone: displayPhone ?? null }, { onConflict: "phone_number_id" })
    .select("id")
    .single();
  return created!.id as string;
}

async function contactFor(accountId: string, waId: string, name?: string) {
  const { data } = await db
    .from("wa_contacts")
    .select("id, name, ref_source")
    .eq("account_id", accountId)
    .eq("wa_id", waId)
    .maybeSingle();
  if (data) {
    if (name && !data.name) await db.from("wa_contacts").update({ name }).eq("id", data.id);
    return data as { id: string; name: string | null; ref_source: string | null };
  }
  const { data: created } = await db
    .from("wa_contacts")
    .upsert({ account_id: accountId, wa_id: waId, name: name ?? null }, { onConflict: "account_id,wa_id" })
    .select("id, name, ref_source")
    .single();
  return created as { id: string; name: string | null; ref_source: string | null };
}

const tsToIso = (ts: string) => new Date(Number(ts) * 1000).toISOString();

type Change = {
  field: string;
  value: {
    metadata?: { phone_number_id: string; display_phone_number?: string };
    contacts?: { wa_id: string; profile?: { name?: string } }[];
    messages?: WaMessage[];
    message_echoes?: WaMessage[];
    statuses?: { id: string; status: string; timestamp: string }[];
  };
};

/** Store everything one webhook delivery carries. Idempotent on wamid. */
export async function ingestWebhook(payload: { entry?: { changes?: Change[] }[] }) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.metadata?.phone_number_id) continue;
      const accountId = await accountFor(v.metadata.phone_number_id, v.metadata.display_phone_number);
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      // Guest → hotel
      for (const m of v.messages ?? []) {
        if (!m.from) continue;
        const contact = await contactFor(accountId, m.from, names.get(m.from));
        const body = messageText(m);
        const at = tsToIso(m.timestamp);
        const { error } = await db.from("wa_messages").insert({
          account_id: accountId,
          contact_id: contact.id,
          wamid: m.id,
          direction: "in",
          type: m.type,
          body,
          sent_at: at,
          raw: m,
        });
        if (error) continue; // duplicate delivery (wamid unique)

        const update: Record<string, unknown> = { last_message_at: at, last_inbound_at: at };
        // First touch wins: the website Ref, or the Click-to-WhatsApp ad.
        if (!contact.ref_source) {
          const ref = parseRef(body);
          if (ref) {
            update.ref_source = ref.source;
            update.ref_code = ref.code;
          } else if (m.referral?.source_type === "ad") {
            update.ref_source = "FB";
            update.ref_code = `AD${m.referral.source_id ?? ""}`.slice(0, 32);
          }
        }
        const { data: cur } = await db.from("wa_contacts").select("unread").eq("id", contact.id).single();
        update.unread = (cur?.unread ?? 0) + 1;
        await db.from("wa_contacts").update(update).eq("id", contact.id);
      }

      // Hotel → guest, sent from the WhatsApp Business app (coexistence)
      for (const m of v.message_echoes ?? []) {
        if (!m.to) continue;
        const contact = await contactFor(accountId, m.to);
        const at = tsToIso(m.timestamp);
        const { error } = await db.from("wa_messages").insert({
          account_id: accountId,
          contact_id: contact.id,
          wamid: m.id,
          direction: "out",
          via: "app",
          type: m.type,
          body: messageText(m),
          status: "sent",
          sent_at: at,
          raw: m,
        });
        if (!error) await markReplied(contact.id, at);
      }

      // Delivery / read receipts for messages we sent
      for (const s of v.statuses ?? []) {
        await db.from("wa_messages").update({ status: s.status }).eq("wamid", s.id);
      }
    }
  }
}

async function markReplied(contactId: string, at: string) {
  const { data } = await db.from("wa_contacts").select("status").eq("id", contactId).single();
  await db
    .from("wa_contacts")
    .update({ last_message_at: at, unread: 0, ...(data?.status === "new" ? { status: "replied" } : {}) })
    .eq("id", contactId);
}

/** "Mark as booked" details from a form → the jsonb stored on the chat. */
export function bookingFromForm(formData: FormData) {
  const num = (k: string) => {
    const v = Number(String(formData.get(k) ?? "").replace(/,/g, ""));
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const checkIn = String(formData.get("check_in") ?? "");
  return {
    room: String(formData.get("room") ?? "").trim().slice(0, 80) || null,
    check_in: /^\d{4}-\d{2}-\d{2}$/.test(checkIn) ? checkIn : null,
    nights: num("nights"),
    amount: num("amount"),
    // The same booking's ref in the hotel's own admin (e.g. HSS-7K2Q9P), so it's counted once.
    hotel_ref: String(formData.get("hotel_ref") ?? "").trim().toUpperCase().slice(0, 40) || null,
    booked_at: new Date().toISOString(),
  };
}

/** Whether a free-form reply is still allowed (24h after the guest's last message). */
export function replyWindowOpen(lastInboundAt: string | null | undefined) {
  return !!lastInboundAt && Date.now() - new Date(lastInboundAt).getTime() < 24 * 3600 * 1000;
}

/** Free-form reply — only inside the 24h window after the guest's last message. */
export async function sendText(contactId: string, text: string) {
  const { data: contact } = await db
    .from("wa_contacts")
    .select("id, wa_id, last_inbound_at, wa_accounts(id, phone_number_id)")
    .eq("id", contactId)
    .single();
  if (!contact) return { error: "Chat not found." };
  const account = contact.wa_accounts as unknown as { id: string; phone_number_id: string };
  if (!replyWindowOpen(contact.last_inbound_at)) {
    return { error: "The 24-hour reply window has closed — the guest has to message first (or send an approved template)." };
  }

  const cred = await whatsappCredential();
  const res = await fetch(`${GRAPH}/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: contact.wa_id, type: "text", text: { body: text } }),
  });
  const json = (await res.json()) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok || !json.messages?.[0]?.id) return { error: json.error?.message ?? `WhatsApp API error (${res.status})` };

  const at = new Date().toISOString();
  await db.from("wa_messages").insert({
    account_id: account.id,
    contact_id: contact.id,
    wamid: json.messages[0].id,
    direction: "out",
    via: "api",
    type: "text",
    body: text,
    status: "sent",
    sent_at: at,
  });
  await markReplied(contact.id, at);
  return { ok: true };
}
