// Small decisions the runner makes before and after the conversation engine. Pure, no I/O.

import { isOptInYes, isStartWord, isStopWord } from "../words";
import type { BotInput } from "./engine";

/** The part of a stored guest message the bot needs (Meta's own message object is in `raw`). */
export type BotGuestMessage = {
  accountId: string;
  contactId: string;
  wamid: string;
  type: string;
  body: string | null;
  at: string;
  raw: Record<string, unknown>;
};

type Replies = {
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  button?: { text?: string; payload?: string };
};

/** What the guest sent, in the engine's terms: a typed text, a tap on a button or list row, or a photo/document (a receipt). */
export function botInputFrom(m: BotGuestMessage, extra: { phone: string; profileName?: string | null; ref?: { src: string; code: string | null } | null; receiptLink?: string }): BotInput {
  const base = { phone: extra.phone, profileName: extra.profileName ?? null, ref: extra.ref ?? null, receiptLink: extra.receiptLink };
  const raw = m.raw as Replies;
  if (m.type === "interactive") {
    const b = raw.interactive?.button_reply;
    if (b?.id) return { ...base, kind: "button", id: b.id, text: b.title };
    const l = raw.interactive?.list_reply;
    if (l?.id) return { ...base, kind: "list", id: l.id, text: l.title };
    return { ...base, kind: "other" };
  }
  if (m.type === "button" && raw.button?.text) return { ...base, kind: "text", text: raw.button.text };
  if (m.type === "text") return { ...base, kind: "text", text: m.body ?? "" };
  if (m.type === "image" || m.type === "document") return { ...base, kind: "media", text: m.body ?? undefined };
  return { ...base, kind: "other" };
}

export type QuietReason = "opted_out" | "staff_chatting" | "stop_or_start" | "opt_in_answer";

/**
 * When the bot must say nothing: the guest opted out, staff are already answering this chat (Intervened and not
 * resolved since), the message is a STOP/START (handled elsewhere), or it is the YES to our marketing opt-in question.
 */
export function quietReason(
  contact: { opted_out_at: string | null; intervened_at: string | null; resolved_at: string | null },
  m: Pick<BotGuestMessage, "type" | "body">,
  optInQuestionOpen: boolean
): QuietReason | null {
  if (contact.opted_out_at) return "opted_out";
  if (contact.intervened_at && !(contact.resolved_at && new Date(contact.resolved_at) >= new Date(contact.intervened_at))) return "staff_chatting";
  if (m.type === "text" && (isStopWord(m.body) || isStartWord(m.body))) return "stop_or_start";
  if (m.type === "text" && optInQuestionOpen && isOptInYes(m.body)) return "opt_in_answer";
  return null;
}

/** A conversation parked with staff ("handoff") starts afresh once staff have resolved the chat after that. */
export function sessionStillValid(session: { step: string; updatedAt: string } | null, resolvedAt: string | null): boolean {
  if (!session) return false;
  if (session.step === "handoff" && resolvedAt && new Date(resolvedAt) > new Date(session.updatedAt)) return false;
  return true;
}

export type HoldAction = "release" | "remind" | "none";

/** An unpaid booking is held for its hold time: one reminder when 30 minutes are left (or half the time, if shorter), then release. */
export function holdAction(s: { holdUntil: string | null; remindedAt: string | null }, nowMs: number, holdMinutes: number): HoldAction {
  if (!s.holdUntil) return "none";
  const left = new Date(s.holdUntil).getTime() - nowMs;
  if (left <= 0) return "release";
  const remindWindow = Math.min(30, Math.floor(holdMinutes / 2)) * 60_000;
  if (!s.remindedAt && left <= remindWindow) return "remind";
  return "none";
}
