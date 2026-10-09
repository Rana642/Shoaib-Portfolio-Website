/**
 * WhatsApp per-message rates by recipient market — Meta's official USD rate
 * card ("Cost per message in USD on the WhatsApp Business Platform, effective
 * October 1, 2026", downloaded from developers.facebook.com/docs/whatsapp/pricing
 * on 2026-10-09). This is what Meta charges us directly — no BSP margin.
 *
 * Markets not listed are billed at their "Rest of …" region or "Other".
 * Row: [market, marketing, utility, authentication, service] — USD per delivered message.
 *
 * Free (Meta's rules from 1 Oct 2026):
 *  - every business number gets 1,000 free service messages a month (no roll-over)
 *  - everything is free inside a Free Entry Point window (chats started from a
 *    Click-to-WhatsApp ad / Page CTA, 72 h)
 *  - utility templates sent inside an open 24 h customer-service window are free
 */
export const RATE_SOURCE = "Meta's official USD rate card, effective 1 Oct 2026";
export const FREE_SERVICE_PER_NUMBER = 1000;

export type RateRow = readonly [market: string, marketing: number, utility: number, authentication: number, service: number];

export const WHATSAPP_RATES: readonly RateRow[] = [
  ["Argentina", 0.0618, 0.026, 0.026, 0.026],
  ["Bangladesh", 0.0732, 0.0037, 0.0037, 0.0037],
  ["Brazil", 0.0625, 0.0068, 0.0068, 0.0068],
  ["Chile", 0.0889, 0.02, 0.02, 0.02],
  ["Colombia", 0.0125, 0.0008, 0.0008, 0.0008],
  ["Egypt", 0.0644, 0.0036, 0.0036, 0.0036],
  ["France", 0.0859, 0.03, 0.03, 0.03],
  ["Germany", 0.1365, 0.055, 0.055, 0.055],
  ["Hong Kong", 0.0732, 0.026, 0.026, 0.026],
  ["Hungary", 0.086, 0.035, 0.035, 0.035],
  ["India", 0.0118, 0.0014, 0.0014, 0.0014],
  ["Indonesia", 0.0411, 0.025, 0.025, 0.025],
  ["Iraq", 0.0341, 0.0079, 0.0079, 0.0079],
  ["Israel", 0.0353, 0.0053, 0.0053, 0.0053],
  ["Italy", 0.0795, 0.03, 0.03, 0.03],
  ["Kazakhstan", 0.0604, 0.018, 0.018, 0.018],
  ["Kuwait", 0.0792, 0.044, 0.044, 0.044],
  ["Malaysia", 0.086, 0.014, 0.014, 0.014],
  ["Mexico", 0.0397, 0.0085, 0.0085, 0.0085],
  ["Morocco", 0.0414, 0.023, 0.023, 0.023],
  ["Netherlands", 0.1597, 0.05, 0.05, 0.05],
  ["Nepal", 0.0732, 0.0034, 0.0034, 0.0034],
  ["Nigeria", 0.0516, 0.0067, 0.0067, 0.0067],
  ["Oman", 0.0341, 0.0247, 0.0247, 0.0247],
  ["Pakistan", 0.0473, 0.015, 0.015, 0.015],
  ["Peru", 0.0703, 0.03, 0.03, 0.03],
  ["Poland", 0.0366, 0.0122, 0.0122, 0.0122],
  ["Qatar", 0.0341, 0.012, 0.012, 0.012],
  ["Romania", 0.086, 0.029, 0.029, 0.029],
  ["Russia", 0.0802, 0.04, 0.04, 0.04],
  ["Saudi Arabia", 0.0576, 0.0107, 0.0107, 0.0107],
  ["Singapore", 0.0732, 0.016, 0.016, 0.016],
  ["South Africa", 0.0379, 0.0095, 0.0095, 0.0095],
  ["Spain", 0.0707, 0.02, 0.02, 0.02],
  ["Sri Lanka", 0.0732, 0.002, 0.002, 0.002],
  ["Turkey", 0.0109, 0.0009, 0.0009, 0.0009],
  ["Ukraine", 0.086, 0.0298, 0.0298, 0.0298],
  ["United Arab Emirates", 0.0576, 0.0157, 0.0157, 0.0157],
  ["United Kingdom", 0.0635, 0.022, 0.022, 0.022],
  ["North America", 0.025, 0.0034, 0.0034, 0.0034],
  ["Rest of Africa", 0.0225, 0.004, 0.004, 0.004],
  ["Rest of Asia Pacific", 0.0842, 0.0113, 0.0113, 0.0113],
  ["Rest of Central & Eastern Europe", 0.086, 0.0212, 0.0212, 0.0212],
  ["Rest of Latin America", 0.074, 0.0113, 0.0113, 0.0113],
  ["Rest of Middle East", 0.0392, 0.0091, 0.0091, 0.0091],
  ["Rest of Western Europe", 0.0592, 0.0171, 0.0171, 0.0171],
  ["Other", 0.0604, 0.0077, 0.0077, 0.0077],
];
