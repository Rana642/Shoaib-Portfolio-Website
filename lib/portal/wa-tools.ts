"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { addQuickReplyTo, deleteQuickReplyById, saveAutomation, type automationSchema } from "../whatsapp/automation-settings";
import { createTemplate, deleteTemplate } from "../whatsapp/templates";
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
