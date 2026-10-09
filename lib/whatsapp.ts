import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./dashboard/db";
import { getVaultCredential } from "./marketing-vault";
import { decryptField } from "./api-vault-crypto";

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

/** The token for a number: its own business token (Embedded Signup /
 *  coexistence) or, for the Socially Snap test number, the vault's
 *  system-user token. */
export async function tokenForAccount(accountId: string): Promise<string> {
  const { data } = await db.from("wa_accounts").select("access_token_enc").eq("id", accountId).maybeSingle();
  if (data?.access_token_enc) return decryptField(data.access_token_enc as string);
  return (await whatsappCredential()).access_token;
}

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
    /** Coexistence: past chats from the WhatsApp Business app (up to 6 months). */
    history?: { metadata?: { phase?: number; progress?: number }; threads?: { id: string; messages?: WaMessage[] }[] }[];
    /** Coexistence: the phone's contact list (adds / edits). */
    state_sync?: { type?: string; action?: string; contact?: { full_name?: string; phone_number?: string } }[];
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
        // STOP / START: the guest's own opt-out — automation never writes to an opted-out guest.
        const word = body?.trim().toUpperCase();
        if (word === "STOP" || word === "UNSUBSCRIBE") update.opted_out_at = at;
        else if (word === "START") update.opted_out_at = null;
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

      // History sync (coexistence): old chats, imported quietly — no unread,
      // no automation, no Ref re-parsing beyond the first touch.
      for (const chunk of v.history ?? []) {
        for (const thread of chunk.threads ?? []) {
          if (!thread.id) continue;
          const contact = await contactFor(accountId, thread.id);
          let latest = 0;
          let latestIn = 0;
          for (const m of thread.messages ?? []) {
            const inbound = m.from === thread.id;
            const at = tsToIso(m.timestamp);
            const t = Number(m.timestamp) * 1000;
            latest = Math.max(latest, t);
            if (inbound) latestIn = Math.max(latestIn, t);
            await db.from("wa_messages").insert({
              account_id: accountId,
              contact_id: contact.id,
              wamid: m.id,
              direction: inbound ? "in" : "out",
              via: inbound ? null : "app",
              type: m.type,
              body: messageText(m),
              sent_at: at,
            }); // duplicate wamid → ignored
            if (inbound && !contact.ref_source) {
              const ref = parseRef(messageText(m));
              if (ref) {
                await db.from("wa_contacts").update({ ref_source: ref.source, ref_code: ref.code }).eq("id", contact.id);
                contact.ref_source = ref.source;
              }
            }
          }
          if (latest) {
            const { data: cur } = await db.from("wa_contacts").select("last_message_at, last_inbound_at").eq("id", contact.id).single();
            const upd: Record<string, string> = {};
            if (!cur?.last_message_at || new Date(cur.last_message_at).getTime() < latest) upd.last_message_at = new Date(latest).toISOString();
            if (latestIn && (!cur?.last_inbound_at || new Date(cur.last_inbound_at).getTime() < latestIn)) upd.last_inbound_at = new Date(latestIn).toISOString();
            if (Object.keys(upd).length) await db.from("wa_contacts").update(upd).eq("id", contact.id);
          }
        }
      }

      // Contact sync (coexistence): names from the phone's address book.
      for (const s of v.state_sync ?? []) {
        const phone = s.contact?.phone_number?.replace(/\D/g, "");
        if (s.type !== "contact" || !phone || s.action === "remove") continue;
        const c = await contactFor(accountId, phone, s.contact?.full_name);
        if (s.contact?.full_name) await db.from("wa_contacts").update({ name: s.contact.full_name }).eq("id", c.id);
      }
    }
  }
}

/** Staff answered (dashboard, portal or the phone app) → the chat is Intervened. */
export async function markReplied(contactId: string, at: string) {
  const { data } = await db.from("wa_contacts").select("status, intervened_at").eq("id", contactId).single();
  await db
    .from("wa_contacts")
    .update({
      last_message_at: at,
      unread: 0,
      ...(data?.status === "new" ? { status: "replied" } : {}),
      ...(data?.intervened_at ? {} : { intervened_at: at }),
    })
    .eq("id", contactId);
}

/** Minutes a guest waits unanswered before the chat moves to Requesting. */
export const REQUEST_AFTER_MIN = 15;

export type ChatStage = "active" | "requesting" | "intervened";

/**
 * AiSensy-style live-chat stage:
 *  - intervened: staff took over (replied, or pressed Intervene) — automation's
 *    instant/after-hours replies are paused until Resolve
 *  - requesting: the guest's latest message (inside the 24h reply window, after
 *    the last Resolve) is still unanswered for REQUEST_AFTER_MIN, or it carries a
 *    website Ref code — a booking request, so it can't wait
 *  - active: everything else — automation handles it
 */
export function chatStage(
  c: { intervened_at: string | null; resolved_at: string | null; last_inbound_at: string | null; ref_source: string | null; status: string },
  now = Date.now()
): ChatStage {
  if (c.intervened_at) return "intervened";
  if (!c.last_inbound_at || c.status === "booked" || c.status === "lost") return "active";
  const inAt = new Date(c.last_inbound_at).getTime();
  if (c.resolved_at && new Date(c.resolved_at).getTime() >= inAt) return "active";
  if (!replyWindowOpen(c.last_inbound_at)) return "active";
  return c.ref_source || now - inAt >= REQUEST_AFTER_MIN * 60 * 1000 ? "requesting" : "active";
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
/** `via` "auto" = sent by the automation: doesn't count as staff answering
 *  (status and unread stay as they are). */
export async function sendText(contactId: string, text: string, via: "api" | "auto" = "api") {
  const { data: contact } = await db
    .from("wa_contacts")
    .select("id, wa_id, last_inbound_at, opted_out_at, wa_accounts(id, phone_number_id)")
    .eq("id", contactId)
    .single();
  if (!contact) return { error: "Chat not found." };
  if (via === "auto" && contact.opted_out_at) return { error: "Guest opted out (STOP)." };
  const account = contact.wa_accounts as unknown as { id: string; phone_number_id: string };
  if (!replyWindowOpen(contact.last_inbound_at)) {
    return { error: "The 24-hour reply window has closed — the guest has to message first (or send an approved template)." };
  }

  const token = await tokenForAccount(account.id);
  const res = await fetch(`${GRAPH}/${account.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
    via,
    type: "text",
    body: text,
    status: "sent",
    sent_at: at,
  });
  if (via === "auto") await db.from("wa_contacts").update({ last_message_at: at }).eq("id", contact.id);
  else await markReplied(contact.id, at);
  return { ok: true };
}

export type ChatPatch = { handoff?: "intervene" | "resolve"; tags?: string[]; notes?: string };

/** Live-chat edits from the Guest Profile (callers check access first). */
export async function updateChat(contactId: string, patch: ChatPatch) {
  const update: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (patch.handoff === "intervene") update.intervened_at = now;
  if (patch.handoff === "resolve") Object.assign(update, { intervened_at: null, resolved_at: now });
  if (Array.isArray(patch.tags)) {
    const clean = patch.tags.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 30));
    update.tags = [...new Set(clean.filter(Boolean))].slice(0, 20);
  }
  if (typeof patch.notes === "string") update.notes = patch.notes.slice(0, 4000) || null;
  if (!Object.keys(update).length) return { ok: true };
  const { error } = await db.from("wa_contacts").update(update).eq("id", contactId);
  return error ? { error: error.message } : { ok: true };
}
