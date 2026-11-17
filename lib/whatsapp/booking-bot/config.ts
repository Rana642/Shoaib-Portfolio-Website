// A number's booking-bot settings (wa_accounts.booking_bot). The bot runs only when every needed setting is present and sane,
// so a half-filled form can never make it tell guests something empty or wrong.

import type { BotConfig } from "./engine";

export type StoredBotSettings = {
  enabled?: boolean;
  hotelName?: string;
  advanceMode?: string;
  advanceValue?: number | string;
  holdMinutes?: number | string;
  paymentText?: string;
};

export type ParsedBotSettings = { ok: true; config: BotConfig } | { ok: false; problem: string };

export function parseBotSettings(raw: unknown, opts: { requireEnabled?: boolean } = {}): ParsedBotSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as StoredBotSettings;
  if (opts.requireEnabled !== false && s.enabled !== true) return { ok: false, problem: "The booking bot is off for this number." };
  const hotelName = typeof s.hotelName === "string" ? s.hotelName.trim() : "";
  if (hotelName.length < 2 || hotelName.length > 80) return { ok: false, problem: "Write the hotel's name (shown in the greeting)." };
  const paymentText = typeof s.paymentText === "string" ? s.paymentText.trim() : "";
  if (paymentText.length < 10 || paymentText.length > 600) return { ok: false, problem: "Write how guests pay the advance (account number and name), 10 to 600 characters." };
  const mode = s.advanceMode === "first_night" ? "first_night" : s.advanceMode === "percent" ? "percent" : null;
  if (!mode) return { ok: false, problem: "Choose the advance: a percent of the total, or the first night." };
  const value = Number(s.advanceValue);
  if (mode === "percent" && !(value >= 1 && value <= 100)) return { ok: false, problem: "The advance percent must be between 1 and 100." };
  const hold = Number(s.holdMinutes);
  if (!(hold >= 15 && hold <= 1440)) return { ok: false, problem: "Hold the room for 15 minutes to 24 hours." };
  return { ok: true, config: { hotelName, advance: { mode, value: mode === "percent" ? Math.round(value) : 0 }, holdMinutes: Math.round(hold), paymentText } };
}
