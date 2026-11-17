import "server-only";
import { db } from "../../dashboard/db";
import { decryptField } from "../../api-vault-crypto";
import { optInQuestionOpen, sendInteractive, sendText, updateChat, type GuestMessage } from "../index";
import { parseBotSettings } from "./config";
import type { BotConfig, BotSession, HotelApi } from "./engine";
import { makeHotelApi } from "./hotel-api";
import { holdAction } from "./input";
import { processGuestMessage, type ContactRow, type RunnerDeps, type StoredSession } from "./orchestrator";

/**
 * The booking bot's connection to the real world: database, WhatsApp and the hotel's booking API.
 * runBookingBot() is called after a webhook has been answered (see the two webhook routes), sweepBookingBots() every
 * minute from the existing WhatsApp cron. Everything here is best effort: a failure is logged and never reaches the
 * guest as a broken reply or the webhook as an error.
 */

const appBase = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://adsbyshoaib.com").replace(/\/$/, "");
const log = (line: string) => console.error("[booking-bot]", line);

type AccountRow = { id: string; project_id: string | null; booking_bot: unknown };

/** The bot's settings and hotel API for one number, or null when the bot is off / the number isn't a connected Elegant. */
async function loadAccount(accountId: string): Promise<{ config: BotConfig; api: HotelApi } | null> {
  const { data } = await db.from("wa_accounts").select("id, project_id, booking_bot").eq("id", accountId).maybeSingle();
  const a = data as AccountRow | null;
  if (!a?.project_id) return null;
  const parsed = parseBotSettings(a.booking_bot);
  if (!parsed.ok) return null;
  const { data: src } = await db.from("project_booking_sources").select("kind, key_enc, site_url").eq("project_id", a.project_id).maybeSingle();
  // The booking API exists on the Elegant site only (Silver Sand follows).
  if (!src || src.kind !== "elegant" || !src.site_url) return null;
  const api = makeHotelApi({ url: `${String(src.site_url).replace(/\/$/, "")}/api/bot/booking`, key: decryptField(src.key_enc as string) });
  return { config: parsed.config, api };
}
async function loadContact(contactId: string): Promise<ContactRow | null> {
  const { data } = await db
    .from("wa_contacts")
    .select("id, wa_id, name, ref_source, ref_code, opted_out_at, intervened_at, resolved_at")
    .eq("id", contactId)
    .maybeSingle();
  return (data as ContactRow | null) ?? null;
}

async function loadSession(contactId: string): Promise<StoredSession | null> {
  const { data, error } = await db.from("wa_bot_sessions").select("step, data, strikes, hold_until, last_wamid, updated_at").eq("contact_id", contactId).maybeSingle();
  // A missing table (migration not run) must stop the bot, not let it answer without remembering anything.
  if (error) throw new Error(`session store unavailable: ${error.code ?? error.message}`);
  if (!data) return null;
  return {
    session: { step: data.step, data: data.data ?? {}, strikes: data.strikes ?? 0, holdUntil: data.hold_until ?? null } as BotSession,
    lastWamid: (data.last_wamid as string | null) ?? null,
    updatedAt: data.updated_at as string,
  };
}

async function saveSession(contactId: string, accountId: string, s: BotSession, wamid: string | null) {
  const ref = s.data.bookingRef ?? null;
  const { error } = await db.from("wa_bot_sessions").upsert(
    {
      contact_id: contactId,
      account_id: accountId,
      step: s.step,
      data: s.data,
      strikes: s.strikes,
      hold_until: s.holdUntil ?? null,
      ...(ref ? { booking_ref: ref } : {}),
      ...(wamid ? { last_wamid: wamid } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contact_id" }
  );
  if (error) throw new Error(`session not saved: ${error.code ?? error.message}`);
}

const realDeps = (): RunnerDeps => ({
  account: async (id) => {
    const a = await loadAccount(id);
    return a ? { config: a.config, api: a.api } : null;
  },
  contact: loadContact,
  loadSession,
  saveSession: (contactId, accountId, s, wamid) => saveSession(contactId, accountId, s, wamid),
  optInOpen: optInQuestionOpen,
  sendText: async (contactId, body) => {
    const r = await sendText(contactId, body, "auto", { kind: "booking_bot" });
    return "error" in r ? { error: r.error } : { ok: true };
  },
  sendInteractive: async (contactId, interactive, summary) => {
    const r = await sendInteractive(contactId, interactive, summary, { kind: "booking_bot" });
    return "error" in r ? { error: r.error } : { ok: true };
  },
  recordBooking: async (contactId, created) => {
    // The chat shows as Booked with the hotel's own ref, so the "Booked chat → Purchase" hook skips it (the hotel's booking
    // flow already sent its Purchase).
    await db
      .from("wa_contacts")
      .update({
        status: "booked",
        booking: { room: created.roomName, check_in: created.checkIn, nights: created.nights, amount: created.total, hotel_ref: created.bookingRef, booked_at: new Date().toISOString(), via: "whatsapp_bot" },
      })
      .eq("id", contactId);
  },
  handoff: async (contactId) => {
    await updateChat(contactId, { handoff: "intervene" });
  },
  now: () => new Date(),
  receiptLinkFor: (contactId) => `${appBase()}/dashboard/whatsapp?chat=${contactId}`,
  log,
});

/** Answer the guest messages a webhook just stored. Messages of one chat are handled in order. */
export async function runBookingBot(messages: GuestMessage[]): Promise<void> {
  const deps = realDeps();
  for (const m of messages) {
    try {
      await processGuestMessage(m, deps);
    } catch (error) {
      log(`message failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

type SessionRow = { contact_id: string; account_id: string; step: string; data: BotSession["data"]; hold_until: string | null; booking_ref: string; reminded_at: string | null };

/**
 * Every minute: one reminder when the room hold is nearly over, release it when it is over, and (every 5 minutes) tell
 * guests whose booking staff have confirmed - whether staff did it in the hotel admin or in the portal.
 */
export async function sweepBookingBots(now: Date = new Date()): Promise<{ released: number; reminded: number; confirmed: number }> {
  const out = { released: 0, reminded: 0, confirmed: 0 };
  const since = new Date(now.getTime() - 3 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("wa_bot_sessions")
    .select("contact_id, account_id, step, data, hold_until, booking_ref, reminded_at")
    .in("step", ["await_receipt", "done"])
    .not("booking_ref", "is", null)
    .is("confirmed_notified_at", null)
    .gt("updated_at", since)
    .limit(50);
  if (error) {
    log(`sweep: ${error.code ?? error.message}`);
    return out;
  }
  const checkConfirmed = now.getMinutes() % 5 === 0;
  const accounts = new Map<string, Awaited<ReturnType<typeof loadAccount>>>();
  for (const row of (data ?? []) as SessionRow[]) {
    try {
      if (!accounts.has(row.account_id)) accounts.set(row.account_id, await loadAccount(row.account_id));
      const acct = accounts.get(row.account_id);
      if (!acct) continue;
      const contact = await loadContact(row.contact_id);
      if (!contact) continue;
      const ref = row.booking_ref;

      if (row.step === "await_receipt") {
        const action = holdAction({ holdUntil: row.hold_until, remindedAt: row.reminded_at }, now.getTime(), acct.config.holdMinutes);
        if (action === "release") {
          const r = await acct.api.cancel(ref, contact.wa_id);
          if (r.ok) {
            out.released += 1;
            await db.from("wa_bot_sessions").update({ step: "done", hold_until: null, updated_at: now.toISOString() }).eq("contact_id", row.contact_id);
            await sendText(row.contact_id, `Your hold on booking ${ref} has ended and the room was released. Message us any time to book again.`, "auto", { kind: "booking_bot" });
            // The chat is no longer "Booked" because of this hold.
            const { data: c } = await db.from("wa_contacts").select("booking").eq("id", row.contact_id).maybeSingle();
            if ((c?.booking as { hotel_ref?: string } | null)?.hotel_ref === ref) await db.from("wa_contacts").update({ status: "replied", booking: null }).eq("id", row.contact_id);
          }
          continue;
        }
        if (action === "remind") {
          await sendText(row.contact_id, `Reminder: your room for booking ${ref} is held for a little longer. Please send the payment receipt photo here to confirm it.`, "auto", { kind: "booking_bot" });
          await db.from("wa_bot_sessions").update({ reminded_at: now.toISOString() }).eq("contact_id", row.contact_id);
          out.reminded += 1;
        }
      }

      if (checkConfirmed) {
        const found = await acct.api.lookup(contact.wa_id, ref);
        const mine = found.ok ? found.bookings.find((b) => b.bookingRef === ref) : null;
        if (mine?.status === "confirmed" || mine?.status === "checked_in") {
          const sent = await sendText(row.contact_id, `Good news: your booking ${ref} is confirmed. We look forward to welcoming you at ${acct.config.hotelName}.`, "auto", { kind: "booking_bot" });
          // If the 24-hour window is closed the message can't go out as free text; try again next time until the session is 3 days old.
          if (!("error" in sent)) {
            await db.from("wa_bot_sessions").update({ confirmed_notified_at: now.toISOString(), step: "done", hold_until: null }).eq("contact_id", row.contact_id);
            out.confirmed += 1;
          }
        }
      }
    } catch (error) {
      log(`sweep ${row.contact_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return out;
}
