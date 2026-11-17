"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { addQuickReplyTo, deleteQuickReplyById, saveAutomation, type automationSchema } from "../whatsapp/automation-settings";
import { createTemplate, deleteTemplate } from "../whatsapp/templates";
import { broadcastLoad, cancelBroadcast, createBroadcast, PORTAL_BROADCAST_DAILY_CAP, previewAudience, type Audience } from "../whatsapp/broadcasts";
import { db } from "../dashboard/db";
import type { TemplateInput } from "../whatsapp/template-shared";
import { portalAccountAccess, portalQuickReplyAccess } from "./wa-access";

// Client-portal actions for the WhatsApp tools: templates and automation. Each one first proves the number
// is one of the caller's own (portalAccountAccess), then does the same thing the admin dashboard does.

const NO = { error: "You don't have access to this number." };

export async function portalCreateTemplate(accountId: string, input: TemplateInput) {
  if (!(await portalAccountAccess(accountId, "wa_templates"))) return NO;
  const result = await createTemplate(accountId, input);
  revalidatePath("/portal/whatsapp/templates");
  return result;
}

export async function portalDeleteTemplate(accountId: string, name: string) {
  if (!(await portalAccountAccess(accountId, "wa_templates"))) return NO;
  const result = await deleteTemplate(accountId, String(name));
  revalidatePath("/portal/whatsapp/templates");
  return result;
}

export async function portalSaveAutomation(accountId: string, settings: z.infer<typeof automationSchema>) {
  if (!(await portalAccountAccess(accountId, "wa_automation"))) return NO;
  const result = await saveAutomation(accountId, settings);
  revalidatePath("/portal/whatsapp/automation");
  return result;
}

export async function portalAddQuickReply(accountId: string, title: string, body: string) {
  if (!(await portalAccountAccess(accountId, "wa_automation"))) return NO;
  const result = await addQuickReplyTo(accountId, title, body);
  revalidatePath("/portal/whatsapp/automation");
  return result;
}

export async function portalDeleteQuickReply(id: string) {
  if (!(await portalQuickReplyAccess(id, "wa_automation"))) return NO;
  const result = await deleteQuickReplyById(id);
  revalidatePath("/portal/whatsapp/automation");
  return result;
}

// Marketing broadcasts from the portal. Whatever the browser sends, the server only ever reaches guests who agreed to
// offers (requireOptIn, checked again at send time), and never more than the daily limit.

const roomLeft = async (accountId: string, at: Date = new Date()) => Math.max(0, PORTAL_BROADCAST_DAILY_CAP - (await broadcastLoad(accountId, at)));

export async function portalPreviewBroadcast(accountId: string, audience: Audience, category: string) {
  if (!(await portalAccountAccess(accountId, "wa_broadcasts"))) return { count: 0, capped: false, usd: 0, room: 0 };
  const result = await previewAudience(accountId, { ...audience, optInOnly: true }, String(category));
  return { ...result, room: await roomLeft(accountId) };
}

export async function portalCreateBroadcast(input: {
  accountId: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  params: string[];
  audience: Audience;
  scheduledAt: string | null;
}) {
  if (!(await portalAccountAccess(input.accountId, "wa_broadcasts"))) return NO;
  const when = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  if (Number.isNaN(when.getTime())) return { error: "That send time isn't valid." };
  const result = await createBroadcast({
    ...input,
    params: Array.isArray(input.params) ? input.params.map(String) : [],
    requireOptIn: true,
    maxRecipients: await roomLeft(input.accountId, when),
  });
  // Two broadcasts created at the same moment could both have seen the same room: count again, and take this one back if the day is over the limit.
  if ("ok" in result && result.ok && (await broadcastLoad(input.accountId, when)) > PORTAL_BROADCAST_DAILY_CAP) {
    await cancelBroadcast(result.id);
    revalidatePath("/portal/whatsapp/broadcasts");
    return { error: "Another broadcast was queued at the same time and together they would pass the 24-hour limit. This one was cancelled; try again later." };
  }
  revalidatePath("/portal/whatsapp/broadcasts");
  return result;
}

export async function portalCancelBroadcast(id: string) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return NO;
  const { data } = await db.from("wa_broadcasts").select("account_id").eq("id", id).maybeSingle();
  if (!data?.account_id || !(await portalAccountAccess(data.account_id as string, "wa_broadcasts"))) return NO;
  const result = await cancelBroadcast(id);
  revalidatePath("/portal/whatsapp/broadcasts");
  return result;
}
