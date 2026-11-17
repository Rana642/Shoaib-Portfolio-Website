import "server-only";
import { db } from "../dashboard/db";
import { sociallySnapMode, unattendedSendingAllowed } from "../socially-snap/client";
import { deliverTemplate, listTemplates } from "./templates";
import { WHATSAPP_RATES } from "./rates";
import type { WaTemplate } from "./template-shared";

/**
 * WhatsApp broadcasts: one approved template to a filtered list of a number's
 * contacts. Creating one queues a row per recipient; the every-minute
 * 'whatsapp-auto' cron sends BATCH of them per run, so a big list goes out
 * steadily instead of in one burst (Meta lowers a number's quality rating —
 * and its daily limit — when many people block or report a blast).
 * Contacts who sent STOP are never queued, and are skipped if they opt out
 * while the broadcast is still sending.
 */

export type Audience = {
  statuses?: string[]; // new / replied / booked / lost
  tag?: string;
  source?: string; // FB / GA / GS / WEB / none
  activeDays?: number; // last message within N days
  nameFallback?: string; // used for {name} when a contact has no name
  optInOnly?: boolean; // only guests who agreed to offers (marketing_opt_in_at set)
};

const MAX_RECIPIENTS = 5000;
const BATCH = 60; // messages per cron run (= per minute)

function audienceQuery(accountId: string, a: Audience) {
  let q = db.from("wa_contacts").select("id, wa_id", { count: "exact" }).eq("account_id", accountId).is("opted_out_at", null);
  if (a.optInOnly) q = q.not("marketing_opt_in_at", "is", null);
  const statuses = (a.statuses ?? []).filter((s) => ["new", "replied", "booked", "lost"].includes(s));
  if (statuses.length) q = q.in("status", statuses);
  if (a.tag?.trim()) q = q.contains("tags", [a.tag.trim()]);
  if (a.source === "none") q = q.is("ref_source", null);
  else if (a.source && ["FB", "GA", "GS", "WEB"].includes(a.source)) q = q.eq("ref_source", a.source);
  if (a.activeDays && a.activeDays > 0) q = q.gte("last_message_at", new Date(Date.now() - a.activeDays * 86400000).toISOString());
  return q;
}

/** Rough cost per message by the contact's country code (Meta's rate card; unknown codes → "Other"). */
const PREFIX_MARKET: [string, string][] = [
  ["92", "Pakistan"],
  ["91", "India"],
  ["971", "United Arab Emirates"],
  ["966", "Saudi Arabia"],
  ["44", "United Kingdom"],
  ["1", "North America"],
];
function rateFor(waId: string, category: string) {
  const market = PREFIX_MARKET.find(([p]) => waId.startsWith(p))?.[1] ?? "Other";
  const row = WHATSAPP_RATES.find((r) => r[0] === market) ?? WHATSAPP_RATES.find((r) => r[0] === "Other")!;
  return category === "MARKETING" ? row[1] : category === "AUTHENTICATION" ? row[3] : row[2];
}

/** How many contacts match, and the estimated Meta cost in USD. */
export async function previewAudience(accountId: string, a: Audience, category: string) {
  const { data, count } = await audienceQuery(accountId, a).limit(MAX_RECIPIENTS);
  const usd = (data ?? []).reduce((s, c) => s + rateFor(c.wa_id as string, category), 0);
  return { count: count ?? 0, capped: (count ?? 0) > MAX_RECIPIENTS, usd };
}

/** What the client portal may send to one number in 24 hours (Meta's starting limit for a number that isn't business-verified). */
export const PORTAL_BROADCAST_DAILY_CAP = 250;

/**
 * The most guests this number is set to message in any 24 hours that include `at`: what is queued or already sent
 * (a cancelled broadcast still counts what went out), by the time each broadcast is meant to go. So cancelling after a
 * partial send, or scheduling for another day, can't be used to get past the limit.
 */
export async function broadcastLoad(accountId: string, at: Date = new Date()): Promise<number> {
  const day = 24 * 3600 * 1000;
  const { data: bs } = await db
    .from("wa_broadcasts")
    .select("id, scheduled_at")
    .eq("account_id", accountId)
    .gt("scheduled_at", new Date(at.getTime() - day).toISOString())
    .lt("scheduled_at", new Date(at.getTime() + day).toISOString());
  if (!bs?.length) return 0;
  const { data: rs } = await db.from("wa_broadcast_recipients").select("broadcast_id").in("broadcast_id", bs.map((b) => b.id as string)).neq("status", "skipped").limit(20000);
  const per = new Map<string, number>();
  for (const r of rs ?? []) per.set(r.broadcast_id as string, (per.get(r.broadcast_id as string) ?? 0) + 1);
  let before = 0;
  let after = 0;
  for (const b of bs) {
    const t = new Date(b.scheduled_at as string).getTime();
    const n = per.get(b.id as string) ?? 0;
    if (t <= at.getTime()) before += n;
    if (t >= at.getTime()) after += n;
  }
  return Math.max(before, after);
}

export async function createBroadcast(input: {
  accountId: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  params: string[];
  audience: Audience;
  scheduledAt: string | null;
  /** Only guests who agreed to offers; also checked again when each message is sent. */
  requireOptIn?: boolean;
  /** Refuse an audience bigger than this (the portal's daily limit). */
  maxRecipients?: number;
}) {
  const name = input.name.trim().slice(0, 80);
  const audience: Audience = input.requireOptIn ? { ...input.audience, optInOnly: true } : input.audience;
  if (!name) return { error: "Give the broadcast a name." };
  let template: WaTemplate | undefined;
  try {
    template = (await listTemplates(input.accountId, true)).find((t) => t.name === input.templateName && t.language === input.templateLanguage);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't load the templates." };
  }
  if (!template) return { error: "Pick an approved template." };
  const params = input.params.slice(0, template.vars).map((p) => String(p).trim().slice(0, 500));
  if (params.length < template.vars || params.some((p) => !p)) return { error: "Fill in every variable." };
  const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  if (Number.isNaN(when.getTime())) return { error: "That send time isn't valid." };

  const { data: contacts } = await audienceQuery(input.accountId, audience).limit(MAX_RECIPIENTS);
  if (!contacts?.length) return { error: "No contacts match this audience." };
  if (input.maxRecipients !== undefined && contacts.length > input.maxRecipients) {
    return { error: `This would reach ${contacts.length.toLocaleString("en-US")} guests, but only ${Math.max(0, input.maxRecipients).toLocaleString("en-US")} more can be messaged in 24 hours. Narrow the audience or try again later.` };
  }

  const snapshot: Pick<WaTemplate, "name" | "language" | "category" | "header" | "body" | "footer" | "vars"> = {
    name: template.name,
    language: template.language,
    category: template.category,
    header: template.header,
    body: template.body,
    footer: template.footer,
    vars: template.vars,
  };
  const { data: b, error } = await db
    .from("wa_broadcasts")
    .insert({
      account_id: input.accountId,
      name,
      template: snapshot,
      params,
      audience,
      scheduled_at: when.toISOString(),
      total: contacts.length,
      require_opt_in: !!input.requireOptIn,
    })
    .select("id")
    .single();
  if (error || !b) return { error: error?.message ?? "Couldn't save the broadcast." };

  for (let i = 0; i < contacts.length; i += 1000) {
    const rows = contacts.slice(i, i + 1000).map((c) => ({ broadcast_id: b.id, contact_id: c.id }));
    const { error: e } = await db.from("wa_broadcast_recipients").insert(rows);
    if (e) {
      await db.from("wa_broadcasts").delete().eq("id", b.id);
      return { error: e.message };
    }
  }
  return { ok: true, id: b.id as string, total: contacts.length };
}

export async function cancelBroadcast(id: string) {
  await db.from("wa_broadcast_recipients").update({ status: "skipped" }).eq("broadcast_id", id).eq("status", "queued");
  await db.from("wa_broadcasts").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", id).in("status", ["scheduled", "sending"]);
  return { ok: true };
}

/** Cron: send the next batch of every due broadcast. */
export async function runBroadcasts(now = new Date()) {
  // Socially Snap test mode (or a bad setting): recipients stay queued instead of being spent on dry runs.
  if (!unattendedSendingAllowed()) return [];
  const { data: due } = await db
    .from("wa_broadcasts")
    .select("id, account_id, template, params, audience, status, require_opt_in")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at");
  // A number linked from Socially Snap can only send through it: with the switch not live its broadcasts
  // stay queued, instead of every recipient being marked failed.
  const waiting = new Set<string>();
  if (sociallySnapMode() !== "live") {
    const { data: linked } = await db.from("wa_accounts").select("id").eq("via_socially_snap", true);
    for (const a of linked ?? []) waiting.add(a.id as string);
  }
  let budget = BATCH;
  const report: { id: string; sent: number; failed: number }[] = [];

  for (const b of due ?? []) {
    if (budget <= 0) break;
    if (waiting.has(b.account_id as string)) continue;
    if (b.status === "scheduled") await db.from("wa_broadcasts").update({ status: "sending" }).eq("id", b.id);
    const { data: next } = await db
      .from("wa_broadcast_recipients")
      .select("id")
      .eq("broadcast_id", b.id)
      .eq("status", "queued")
      .limit(budget);
    // Claim the rows first (queued → sent) so an overlapping cron run can't send them twice.
    const { data: queue } = next?.length
      ? await db
          .from("wa_broadcast_recipients")
          .update({ status: "sent" })
          .in(
            "id",
            next.map((r) => r.id)
          )
          .eq("status", "queued")
          .select("id, contact_id, wa_contacts(name, opted_out_at, marketing_opt_in_at)")
      : { data: [] };

    if (!next?.length) {
      await db.from("wa_broadcasts").update({ status: "done", finished_at: now.toISOString() }).eq("id", b.id);
      continue;
    }
    const template = b.template as Pick<WaTemplate, "name" | "language" | "category" | "header" | "body" | "footer">;
    const audience = (b.audience ?? {}) as Audience;
    let sent = 0;
    let failed = 0;
    for (const r of queue ?? []) {
      budget--;
      const contact = r.wa_contacts as unknown as { name: string | null; opted_out_at: string | null; marketing_opt_in_at: string | null } | null;
      // A broadcast that needs consent never goes to someone whose consent is gone (a STOP in the meantime).
      if (!contact || contact.opted_out_at || (b.require_opt_in && !contact.marketing_opt_in_at)) {
        await db.from("wa_broadcast_recipients").update({ status: "skipped" }).eq("id", r.id);
        continue;
      }
      const first = (contact.name ?? "").trim().split(/\s+/)[0] || audience.nameFallback?.trim() || "there";
      const values = ((b.params ?? []) as string[]).map((p) => p.replace(/\{name\}/gi, first));
      const res = await deliverTemplate(r.contact_id as string, template, values, { broadcast: true }).catch((e) => ({
        error: e instanceof Error ? e.message : "Send failed",
      }));
      if ("wamid" in res) {
        sent++;
        await db.from("wa_broadcast_recipients").update({ wamid: res.wamid, sent_at: new Date().toISOString() }).eq("id", r.id);
      } else {
        failed++;
        await db.from("wa_broadcast_recipients").update({ status: "failed", error: res.error.slice(0, 300) }).eq("id", r.id);
      }
    }
    report.push({ id: b.id as string, sent, failed });
  }
  return report;
}
