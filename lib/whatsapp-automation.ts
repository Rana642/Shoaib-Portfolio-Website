import "server-only";
import { db } from "./dashboard/db";
import { sendText } from "./whatsapp";

/**
 * WhatsApp automation (phase 4) — run every minute by pg_cron
 * ('whatsapp-auto' → /api/whatsapp/automation). Per number, all OFF until
 * Shoaib writes a message and switches it on:
 *  - instant: the guest wrote and nobody answered within `delayMin` → reply
 *  - afterHours: same, but in the night window (PKT) → its own text, sooner
 *  - followUp: we answered, the guest went quiet for `afterHours` hours →
 *    one nudge, only inside the free 24h window
 * Never talks over staff: any reply from the phone app or dashboard after the
 * guest's message cancels the instant reply. At most one auto reply per chat
 * per 12 h, and one follow-up per guest message. Booked / not-booked chats
 * are left alone.
 */

export type Automation = {
  instant?: { on?: boolean; delayMin?: number; text?: string };
  afterHours?: { on?: boolean; from?: string; to?: string; text?: string };
  followUp?: { on?: boolean; afterHours?: number; text?: string };
};

const HOUR = 3600 * 1000;
const WINDOW = 23.5 * HOUR; // stay safely inside Meta's 24h service window

/** Is this moment inside "from"–"to" (HH:MM, PKT)? Handles windows past midnight. */
export function inNightWindow(at: Date, from = "23:00", to = "08:00") {
  const pkt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = m(pkt);
  return m(from) <= m(to) ? t >= m(from) && t < m(to) : t >= m(from) || t < m(to);
}

/** {name} → the guest's first name (or nothing). */
const render = (text: string, name: string | null) =>
  text.replace(/\{name\}/gi, (name ?? "").trim().split(/\s+/)[0] ?? "").replace(/\s+([,.!?])/g, "$1").trim();

export async function runAutomation(now = new Date()) {
  const { data: accounts } = await db.from("wa_accounts").select("id, automation");
  const sent: { contact: string; kind: string; error?: string }[] = [];

  for (const acc of accounts ?? []) {
    const a = (acc.automation ?? {}) as Automation;
    const instantOn = !!(a.instant?.on && a.instant.text?.trim());
    const nightOn = !!(a.afterHours?.on && a.afterHours.text?.trim());
    const followOn = !!(a.followUp?.on && a.followUp.text?.trim());
    if (!instantOn && !nightOn && !followOn) continue;

    const { data: contacts } = await db
      .from("wa_contacts")
      .select("id, name, status, last_inbound_at, auto_reply_at, follow_up_at")
      .eq("account_id", acc.id)
      .gte("last_inbound_at", new Date(now.getTime() - WINDOW).toISOString())
      .not("status", "in", "(booked,lost)")
      .limit(300);
    if (!contacts?.length) continue;

    // Latest message from our side (phone app, dashboard or automation) per chat.
    const { data: outs } = await db
      .from("wa_messages")
      .select("contact_id, sent_at")
      .in(
        "contact_id",
        contacts.map((c) => c.id)
      )
      .eq("direction", "out")
      .gte("sent_at", new Date(now.getTime() - 2 * WINDOW).toISOString())
      .order("sent_at", { ascending: false });
    const lastOut = new Map<string, number>();
    for (const o of outs ?? []) if (!lastOut.has(o.contact_id)) lastOut.set(o.contact_id, new Date(o.sent_at).getTime());

    for (const c of contacts) {
      const inAt = new Date(c.last_inbound_at as string).getTime();
      const outAt = lastOut.get(c.id) ?? 0;
      const answered = outAt >= inAt;

      // Instant / after-hours: guest waiting, nobody answered yet.
      if (!answered && (instantOn || nightOn)) {
        const recentAuto = c.auto_reply_at && now.getTime() - new Date(c.auto_reply_at).getTime() < 12 * HOUR;
        const night = nightOn && inNightWindow(new Date(inAt), a.afterHours?.from, a.afterHours?.to);
        const delay = (night ? 1 : Math.max(1, Number(a.instant?.delayMin) || 2)) * 60 * 1000;
        const text = night ? a.afterHours!.text! : instantOn ? a.instant!.text! : null;
        if (!recentAuto && text && now.getTime() - inAt >= delay) {
          const res = await sendText(c.id, render(text, c.name), "auto");
          await db.from("wa_contacts").update({ auto_reply_at: now.toISOString() }).eq("id", c.id);
          sent.push({ contact: c.id, kind: night ? "after_hours" : "instant", error: "error" in res ? res.error : undefined });
        }
        continue;
      }

      // Follow-up: we answered, the guest went quiet — once per guest message.
      if (answered && followOn) {
        const waitMs = Math.max(1, Number(a.followUp?.afterHours) || 3) * HOUR;
        const alreadyNudged = c.follow_up_at && new Date(c.follow_up_at).getTime() >= inAt;
        if (!alreadyNudged && now.getTime() - outAt >= waitMs && now.getTime() - inAt < WINDOW) {
          const res = await sendText(c.id, render(a.followUp!.text!, c.name), "auto");
          await db.from("wa_contacts").update({ follow_up_at: now.toISOString() }).eq("id", c.id);
          sent.push({ contact: c.id, kind: "follow_up", error: "error" in res ? res.error : undefined });
        }
      }
    }
  }
  return sent;
}
