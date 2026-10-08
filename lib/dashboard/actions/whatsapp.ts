"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { bookingFromForm, sendText } from "../../whatsapp";
import { sendWhatsAppPurchase } from "../../whatsapp-conversions";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

export async function sendWhatsAppReply(contactId: string, text: string) {
  await assertAuthed();
  const body = text.trim();
  if (!body) return { error: "Type a message first." };
  if (body.length > 4000) return { error: "Message is too long (4,000 characters max)." };
  const result = await sendText(contactId, body);
  revalidatePath("/dashboard/whatsapp");
  return result;
}

export async function setWhatsAppStatus(contactId: string, status: string) {
  await assertAuthed();
  if (!["new", "replied", "booked", "lost"].includes(status)) return { error: "Unknown status." };
  const { error } = await db.from("wa_contacts").update({ status }).eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Which business (client project) a WhatsApp number belongs to — decides whose portal shows it. */
export async function linkWhatsAppAccount(accountId: string, formData: FormData) {
  await assertAuthed();
  const projectId = String(formData.get("project_id") ?? "") || null;
  const label = String(formData.get("label") ?? "").trim().slice(0, 80) || null;
  const { error } = await db.from("wa_accounts").update({ project_id: projectId, label }).eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Booking details for a chat; marks it Booked. */
export async function saveWhatsAppBooking(contactId: string, formData: FormData) {
  await assertAuthed();
  const { error } = await db
    .from("wa_contacts")
    .update({ status: "booked", booking: bookingFromForm(formData) })
    .eq("id", contactId);
  if (error) return { error: error.message };
  await sendWhatsAppPurchase(contactId).catch(() => {});
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Opening a chat clears its unread badge. */
export async function markWhatsAppRead(contactId: string) {
  await assertAuthed();
  await db.from("wa_contacts").update({ unread: 0 }).eq("id", contactId);
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const automationSchema = z.object({
  instant: z.object({ on: z.boolean(), delayMin: z.number().int().min(1).max(60), text: z.string().max(1500) }),
  afterHours: z.object({ on: z.boolean(), from: hhmm, to: hhmm, text: z.string().max(1500) }),
  followUp: z.object({ on: z.boolean(), afterHours: z.number().int().min(1).max(20), text: z.string().max(1500) }),
});

/** Automation settings for one number (all off until a message is written). */
export async function saveWhatsAppAutomation(accountId: string, settings: z.infer<typeof automationSchema>) {
  await assertAuthed();
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
  revalidatePath("/dashboard/whatsapp/automation");
  return { ok: true };
}

export async function addQuickReply(accountId: string, title: string, body: string) {
  await assertAuthed();
  const t = title.trim().slice(0, 60);
  const b = body.trim().slice(0, 2000);
  if (!t || !b) return { error: "Give it a title and a message." };
  const { count } = await db.from("wa_quick_replies").select("id", { count: "exact", head: true }).eq("account_id", accountId);
  const { error } = await db.from("wa_quick_replies").insert({ account_id: accountId, title: t, body: b, sort_order: count ?? 0 });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/whatsapp/automation");
  return { ok: true };
}

export async function deleteQuickReply(id: string) {
  await assertAuthed();
  await db.from("wa_quick_replies").delete().eq("id", id);
  revalidatePath("/dashboard/whatsapp/automation");
  return { ok: true };
}
