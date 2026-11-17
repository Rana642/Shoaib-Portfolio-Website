"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { bookingFromForm, sendText, updateChat, type ChatPatch } from "../../whatsapp";
import { sendWhatsAppPurchase } from "../../whatsapp/conversions";
import { completeEmbeddedSignup, linkSociallySnapNumber, removeWhatsAppNumber, restoreOwnCallback } from "../../whatsapp/onboarding";
import { accountOfChat, createTemplate, deleteTemplate, listTemplates, sendTemplate } from "../../whatsapp/templates";
import type { TemplateInput } from "../../whatsapp/template-shared";
import { cancelBroadcast, createBroadcast, previewAudience, type Audience } from "../../whatsapp/broadcasts";
import { addQuickReplyTo, automationSchema, deleteQuickReplyById, saveAutomation } from "../../whatsapp/automation-settings";
import { cleanInfoTopics, parseBotSettings } from "../../whatsapp/booking-bot/config";

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

/** Free a number from its business (its chats leave that client's portal). */
export async function unlinkWhatsAppAccount(accountId: string) {
  await assertAuthed();
  const { error } = await db.from("wa_accounts").update({ project_id: null }).eq("id", accountId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Remove a number and all its chats from the dashboard. */
export async function deleteWhatsAppAccount(accountId: string) {
  await assertAuthed();
  const result = await removeWhatsAppNumber(accountId);
  revalidatePath("/dashboard/whatsapp");
  return result;
}

/** Link a number connected in Socially Snap to a hotel (no Meta token is stored here). */
export async function linkSociallySnapNumberAction(formData: FormData) {
  await assertAuthed();
  const result = await linkSociallySnapNumber({
    phone_number_id: formData.get("phone_number_id"),
    project_id: formData.get("project_id"),
    label: formData.get("label"),
  });
  revalidatePath("/dashboard/whatsapp/numbers");
  // Only a fixed code goes in the URL; the reason is shown from the server side, never from the query string.
  if (!("ok" in result)) console.error("linkSociallySnapNumberAction:", result.error);
  redirect(`/dashboard/whatsapp/numbers?linked=${"ok" in result ? "ok" : "failed"}`);
}

/** The way back from Socially Snap: this site gets the number's webhooks again. */
export async function restoreWhatsAppCallback(formData: FormData) {
  await assertAuthed();
  const result = await restoreOwnCallback(String(formData.get("account_id") ?? ""));
  redirect(`/dashboard/whatsapp/numbers?callback=${"ok" in result ? "restored" : "failed"}`);
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

/** Intervene / Resolve, tags and notes from the Guest Profile. */
export async function updateWhatsAppChat(contactId: string, patch: ChatPatch) {
  await assertAuthed();
  const result = await updateChat(contactId, patch);
  revalidatePath("/dashboard/whatsapp");
  return result;
}

/** Opening a chat clears its unread badge. */
export async function markWhatsAppRead(contactId: string) {
  await assertAuthed();
  await db.from("wa_contacts").update({ unread: 0 }).eq("id", contactId);
}

/** Automation settings for one number (all off until a message is written). */
export async function saveWhatsAppAutomation(accountId: string, settings: z.infer<typeof automationSchema>) {
  await assertAuthed();
  const result = await saveAutomation(accountId, settings);
  revalidatePath("/dashboard/whatsapp/automation");
  return result;
}

/**
 * The WhatsApp booking bot's settings for one number. It can only be switched on when every setting is filled in sensibly
 * and the number belongs to a business whose bookings are connected (Elegant: the bot books through the hotel's own site).
 */
export async function saveBookingBotSettings(accountId: string, input: unknown) {
  await assertAuthed();
  if (!/^[0-9a-f-]{36}$/.test(accountId)) return { error: "Unknown number." };
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const wantOn = raw.enabled === true;
  const parsed = parseBotSettings({ ...raw, enabled: wantOn }, { requireEnabled: false });
  if (wantOn && !parsed.ok) return { error: parsed.problem };
  if (wantOn) {
    const { data: acct } = await db.from("wa_accounts").select("project_id").eq("id", accountId).maybeSingle();
    const { data: src } = acct?.project_id
      ? await db.from("project_booking_sources").select("kind, site_url").eq("project_id", acct.project_id).maybeSingle()
      : { data: null };
    if (src?.kind !== "elegant" || !src.site_url) return { error: "This number's business has no connected Elegant booking source, so the bot can't book. Connect it first (Bookings source)." };
  }
  const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const stored = {
    enabled: wantOn,
    hotelName: text(raw.hotelName, 80),
    advanceMode: raw.advanceMode === "first_night" ? "first_night" : raw.advanceMode === "none" ? "none" : "percent",
    advanceValue: Math.max(0, Math.min(100, Math.round(Number(raw.advanceValue) || 0))),
    holdMinutes: Math.max(0, Math.min(1440, Math.round(Number(raw.holdMinutes) || 0))),
    paymentText: text(raw.paymentText, 600),
    refundNote: text(raw.refundNote, 200),
    // This hotel's own answers (written from its knowledge base and approved by the owner), shown under "Rates & info".
    info: cleanInfoTopics(raw.info),
  };
  const { error } = await db.from("wa_accounts").update({ booking_bot: stored }).eq("id", accountId);
  if (error) return { error: /booking_bot/.test(error.message) ? "The database has no booking-bot columns yet. Run the booking-bot block of supabase/dashboard-schema.sql first." : error.message };
  revalidatePath("/dashboard/whatsapp/automation");
  return { ok: true };
}

export async function addQuickReply(accountId: string, title: string, body: string) {
  await assertAuthed();
  const result = await addQuickReplyTo(accountId, title, body);
  revalidatePath("/dashboard/whatsapp/automation");
  return result;
}

export async function deleteQuickReply(id: string) {
  await assertAuthed();
  const result = await deleteQuickReplyById(id);
  revalidatePath("/dashboard/whatsapp/automation");
  return result;
}

/** Embedded Signup finished in the browser — connect the number. */
export async function finishWhatsAppSignup(input: { code: string; wabaId: string; phoneNumberId: string; event: string }) {
  await assertAuthed();
  const ok = /^[A-Za-z0-9_\-.]{10,1000}$/.test(input.code) && /^\d{5,25}$/.test(input.wabaId) && /^\d{5,25}$/.test(input.phoneNumberId);
  if (!ok) return { error: "Sign-up data looked wrong — try again." };
  try {
    const r = await completeEmbeddedSignup({
      code: input.code,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      coexistence: input.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    });
    revalidatePath("/dashboard/whatsapp");
    return { ok: true, display: r.display };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't connect the number." };
  }
}

// ── Message templates ───────────────────────────────────────────────

/** Approved templates for the chat's number (the inbox's template picker). */
export async function whatsAppChatTemplates(contactId: string) {
  await assertAuthed();
  const accountId = await accountOfChat(contactId);
  if (!accountId) return { error: "Chat not found." };
  try {
    return { templates: await listTemplates(accountId, true) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't load templates." };
  }
}

export async function sendWhatsAppTemplate(contactId: string, name: string, language: string, params: string[]) {
  await assertAuthed();
  const result = await sendTemplate(contactId, String(name), String(language), Array.isArray(params) ? params.map(String) : []);
  revalidatePath("/dashboard/whatsapp");
  return result;
}

export async function createWhatsAppTemplate(accountId: string, input: TemplateInput) {
  await assertAuthed();
  const result = await createTemplate(accountId, input);
  revalidatePath("/dashboard/whatsapp/templates");
  return result;
}

export async function deleteWhatsAppTemplate(accountId: string, name: string) {
  await assertAuthed();
  const result = await deleteTemplate(accountId, name);
  revalidatePath("/dashboard/whatsapp/templates");
  return result;
}

// ── Broadcasts ──────────────────────────────────────────────────────

export async function previewWhatsAppBroadcast(accountId: string, audience: Audience, category: string) {
  await assertAuthed();
  return previewAudience(accountId, audience, String(category));
}

export async function createWhatsAppBroadcast(input: {
  accountId: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  params: string[];
  audience: Audience;
  scheduledAt: string | null;
}) {
  await assertAuthed();
  const result = await createBroadcast({ ...input, params: Array.isArray(input.params) ? input.params.map(String) : [] });
  revalidatePath("/dashboard/whatsapp/broadcasts");
  return result;
}

export async function cancelWhatsAppBroadcast(id: string) {
  await assertAuthed();
  const result = await cancelBroadcast(id);
  revalidatePath("/dashboard/whatsapp/broadcasts");
  return result;
}
