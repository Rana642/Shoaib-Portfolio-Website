// What happens when a guest message arrives for a number that has the booking bot on: should the bot answer, what does
// it say, what is saved. All the outside world (database, WhatsApp, the hotel) comes in through `deps`, so this is
// tested without any of them. runner.ts supplies the real ones.

import { handle, type BotConfig, type BotOutput, type BotSession, type HotelApi } from "./engine";
import { botInputFrom, quietReason, sessionStillValid, type BotGuestMessage } from "./input";
import { plainText, toInteractive } from "./messages";
import { isOptInYes } from "../words";

export type StoredSession = { session: BotSession; lastWamid: string | null; updatedAt: string };
export type ContactRow = {
  id: string; wa_id: string; name: string | null; ref_source: string | null; ref_code: string | null;
  opted_out_at: string | null; intervened_at: string | null; resolved_at: string | null;
};
type SendResult = { ok?: true; error?: string };

export interface RunnerDeps {
  /** null when the bot is off for this number (or the number isn't a hotel with a booking API). */
  account(accountId: string): Promise<{ config: BotConfig; api: HotelApi } | null>;
  contact(contactId: string): Promise<ContactRow | null>;
  loadSession(contactId: string): Promise<StoredSession | null>;
  saveSession(contactId: string, accountId: string, s: BotSession, wamid: string): Promise<void>;
  optInOpen(contactId: string, atIso: string): Promise<boolean>;
  /**
   * Has a PERSON (staff) been writing to this guest? The WhatsApp Business app sends an automatic greeting from the phone,
   * and the inbox sees it as staff replying; a message that went to many guests word for word is canned, not a person.
   */
  staffIsChatting(contactId: string): Promise<boolean>;
  sendText(contactId: string, body: string): Promise<SendResult>;
  sendInteractive(contactId: string, interactive: Record<string, unknown>, summary: string): Promise<SendResult>;
  recordBooking(contactId: string, created: NonNullable<BotOutput["created"]>): Promise<void>;
  /** Mark the chat Intervened, so staff see it. */
  handoff(contactId: string): Promise<void>;
  now(): Date;
  receiptLinkFor(contactId: string): string;
  log?(line: string): void;
}

export type RunResult = { ran: boolean; reason?: string; sent?: number };

const windowClosed = (error?: string) => !!error && /24-hour|reply window/i.test(error);

export async function processGuestMessage(m: BotGuestMessage, deps: RunnerDeps): Promise<RunResult> {
  const account = await deps.account(m.accountId);
  if (!account) return { ran: false, reason: "bot_off" };
  const contact = await deps.contact(m.contactId);
  if (!contact) return { ran: false, reason: "no_contact" };

  const optIn = m.type === "text" && isOptInYes(m.body) ? await deps.optInOpen(contact.id, m.at) : false;
  // "Intervened" only silences the bot when a person really took the chat (not the phone app's canned greeting).
  const intervenedOpen = !!contact.intervened_at && !(contact.resolved_at && new Date(contact.resolved_at) >= new Date(contact.intervened_at));
  const staffActive = intervenedOpen ? await deps.staffIsChatting(contact.id) : false;
  const quiet = quietReason(staffActive ? contact : { ...contact, intervened_at: null }, m, optIn);
  if (quiet) return { ran: false, reason: quiet };

  const stored = await deps.loadSession(contact.id);
  if (stored?.lastWamid === m.wamid) return { ran: false, reason: "already_handled" }; // a webhook retry
  const session = stored && sessionStillValid({ step: stored.session.step, updatedAt: stored.updatedAt }, contact.resolved_at) ? stored.session : null;

  const input = botInputFrom(m, {
    phone: contact.wa_id,
    profileName: contact.name,
    ref: contact.ref_source ? { src: contact.ref_source, code: contact.ref_code } : null,
    receiptLink: deps.receiptLinkFor(contact.id),
  });

  let out: BotOutput;
  try {
    out = await handle(session, input, { api: account.api, now: deps.now, config: account.config });
  } catch (error) {
    deps.log?.(`engine failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ran: false, reason: "error" };
  }

  // Save first: a booking may just have been made, and a retry must not make a second one.
  await deps.saveSession(contact.id, m.accountId, out.session, m.wamid);
  if (out.created) await deps.recordBooking(contact.id, out.created).catch((e) => deps.log?.(`recordBooking failed: ${e instanceof Error ? e.message : e}`));

  let sent = 0;
  for (const msg of out.messages) {
    let r: SendResult;
    const interactive = toInteractive(msg);
    if (!interactive) r = await deps.sendText(contact.id, msg.type === "text" ? msg.body : plainText(msg));
    else {
      r = await deps.sendInteractive(contact.id, interactive, plainText(msg));
      // A number that can't show buttons still gets the same words, to be answered by typing.
      if (r.error && !windowClosed(r.error)) r = await deps.sendText(contact.id, plainText(msg));
    }
    if (r.error) {
      deps.log?.(`send failed: ${r.error}`);
      if (windowClosed(r.error)) break;
      continue;
    }
    sent += 1;
  }
  if (out.handoff) await deps.handoff(contact.id).catch((e) => deps.log?.(`handoff failed: ${e instanceof Error ? e.message : e}`));
  return { ran: true, sent };
}
