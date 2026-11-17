// Turns a bot message into what WhatsApp accepts, within its limits, and into the plain text we store in the inbox.
// WhatsApp limits: a button's title is at most 20 characters and there are at most 3; a list shows at most 10 rows
// (title 24, description 72, the "open the list" button 20); the body is at most 1024 characters.

import type { BotMessage } from "./engine";

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

export type InteractivePayload = Record<string, unknown>;

/** null for a plain text message (send it as text). */
export function toInteractive(m: BotMessage): InteractivePayload | null {
  if (m.type === "text") return null;
  if (m.type === "buttons") {
    return {
      type: "button",
      body: { text: clip(m.body, 1024) },
      action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: clip(b.id, 256), title: clip(b.title, 20) } })) },
    };
  }
  return {
    type: "list",
    body: { text: clip(m.body, 1024) },
    action: {
      button: clip(m.button, 20),
      sections: [
        {
          title: "Options",
          rows: m.rows.slice(0, 10).map((r) => ({ id: clip(r.id, 200), title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })),
        },
      ],
    },
  };
}

/** What staff read in the inbox, and what is sent when buttons can't be used. */
export function plainText(m: BotMessage): string {
  if (m.type === "text") return m.body;
  if (m.type === "buttons") return `${m.body}\n\n${m.buttons.map((b) => `• ${b.title}`).join("\n")}`;
  return `${m.body}\n\n${m.rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` (${r.description})` : ""}`).join("\n")}`;
}
