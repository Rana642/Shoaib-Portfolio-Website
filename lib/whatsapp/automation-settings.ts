import "server-only";
import { z } from "zod";
import { db } from "../dashboard/db";

// The checks and writes behind the automation page, shared by the admin dashboard and the client portal.
// Who may call them is decided by each caller: nothing here looks at who is signed in.

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const automationSchema = z.object({
  instant: z.object({ on: z.boolean(), delayMin: z.number().int().min(1).max(60), text: z.string().max(1500) }),
  afterHours: z.object({ on: z.boolean(), from: hhmm, to: hhmm, text: z.string().max(1500) }),
  followUp: z.object({ on: z.boolean(), afterHours: z.number().int().min(1).max(20), text: z.string().max(1500) }),
});

/** Automation settings for one number (all off until a message is written). */
export async function saveAutomation(accountId: string, settings: z.infer<typeof automationSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = automationSchema.safeParse(settings);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const a = parsed.data;
  for (const [on, text, name] of [
    [a.instant.on, a.instant.text, "instant reply"],
    [a.afterHours.on, a.afterHours.text, "after-hours reply"],
    [a.followUp.on, a.followUp.text, "follow-up"],
  ] as const) {
    if (on && !text.trim()) return { error: `Write the ${name} message before switching it on.` };
  }
  const { error } = await db.from("wa_accounts").update({ automation: a }).eq("id", accountId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function addQuickReplyTo(accountId: string, title: string, body: string): Promise<{ ok: true } | { error: string }> {
  const t = String(title).trim().slice(0, 60);
  const b = String(body).trim().slice(0, 2000);
  if (!t || !b) return { error: "Give it a title and a message." };
  const { count } = await db.from("wa_quick_replies").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  const { error } = await db.from("wa_quick_replies").insert({ account_id: accountId, title: t, body: b, sort_order: count ?? 0 });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function deleteQuickReplyById(id: string) {
  await db.from("wa_quick_replies").delete().eq("id", id);
  return { ok: true as const };
}
