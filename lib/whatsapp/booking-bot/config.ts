// A number's booking-bot settings (wa_accounts.booking_bot). The bot runs only when every needed setting is present and sane,
// so a half-filled form can never make it tell guests something empty or wrong.

import type { BotConfig, InfoTopic } from "./engine";

export type StoredBotSettings = {
  enabled?: boolean;
  hotelName?: string;
  advanceMode?: string;
  advanceValue?: number | string;
  holdMinutes?: number | string;
  paymentText?: string;
  refundNote?: string;
  info?: unknown;
};

export type ParsedBotSettings = { ok: true; config: BotConfig } | { ok: false; problem: string };

export const MAX_INFO_TOPICS = 9;

/** Topics written by the hotel: a title (24 characters, it is a list row) and an answer (up to 900). Blank rows are dropped. */
export function cleanInfoTopics(raw: unknown): InfoTopic[] {
  if (!Array.isArray(raw)) return [];
  const out: InfoTopic[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const title = typeof (t as InfoTopic).title === "string" ? (t as InfoTopic).title.trim().slice(0, 24) : "";
    const body = typeof (t as InfoTopic).body === "string" ? (t as InfoTopic).body.trim().slice(0, 900) : "";
    if (title && body) out.push({ title, body });
    if (out.length >= MAX_INFO_TOPICS) break;
  }
  return out;
}

export function parseBotSettings(raw: unknown, opts: { requireEnabled?: boolean } = {}): ParsedBotSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as StoredBotSettings;
  if (opts.requireEnabled !== false && s.enabled !== true) return { ok: false, problem: "The booking bot is off for this number." };
  const hotelName = typeof s.hotelName === "string" ? s.hotelName.trim() : "";
  if (hotelName.length < 2 || hotelName.length > 80) return { ok: false, problem: "Write the hotel's name (shown in the greeting)." };
  const mode = s.advanceMode === "none" ? "none" : s.advanceMode === "first_night" ? "first_night" : s.advanceMode === "percent" ? "percent" : null;
  if (!mode) return { ok: false, problem: "Choose the advance: a percent of the total, the first night, or none (pay at the hotel)." };
  const paymentText = typeof s.paymentText === "string" ? s.paymentText.trim() : "";
  // Payment details are needed whenever a guest may have to pay in advance. With "none" they are optional (a hotel offer
  // that needs advance payment is then explained by staff).
  if (mode !== "none" && (paymentText.length < 10 || paymentText.length > 600)) return { ok: false, problem: "Write how guests pay the advance (account number and name), 10 to 600 characters." };
  if (mode === "none" && paymentText.length > 600) return { ok: false, problem: "The payment text can be at most 600 characters." };
  const refundNote = typeof s.refundNote === "string" ? s.refundNote.trim() : "";
  if (refundNote.length > 200) return { ok: false, problem: "The refund note can be at most 200 characters." };
  const value = Number(s.advanceValue);
  if (mode === "percent" && !(value >= 1 && value <= 100)) return { ok: false, problem: "The advance percent must be between 1 and 100." };
  const hold = Number(s.holdMinutes);
  if (mode !== "none" && !(hold >= 15 && hold <= 1440)) return { ok: false, problem: "Hold the room for 15 minutes to 24 hours." };
  return {
    ok: true,
    config: {
      hotelName,
      advance: { mode, value: mode === "percent" ? Math.round(value) : 0 },
      holdMinutes: mode === "none" && !(hold >= 15 && hold <= 1440) ? 120 : Math.round(hold),
      paymentText,
      refundNote,
      info: cleanInfoTopics(s.info),
    },
  };
}
