"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/dashboard/db";
import { bookingFromForm, sendText, updateChat, type ChatPatch } from "@/lib/whatsapp";
import { sendWhatsAppPurchase } from "@/lib/whatsapp-conversions";
import { can, canSeeProject, requirePortalUser } from "./auth";

/**
 * Client-portal WhatsApp actions. Every call re-derives access from the
 * signed-in user: the chat's number must belong to one of THIS client's
 * projects that the user can see, and they need the "whatsapp" feature.
 */
async function assertChatAccess(contactId: string) {
  const ctx = await requirePortalUser();
  if (!can(ctx, "whatsapp")) return null;
  const { data } = await db
    .from("wa_contacts")
    .select("id, wa_accounts!inner(project_id, client_projects!inner(client_id))")
    .eq("id", contactId)
    .maybeSingle();
  const account = data?.wa_accounts as unknown as { project_id: string; client_projects: { client_id: string } } | undefined;
  if (!account || account.client_projects.client_id !== ctx.clientId || !canSeeProject(ctx, account.project_id)) return null;
  return ctx;
}

export async function portalWhatsAppReply(contactId: string, text: string) {
  if (!(await assertChatAccess(contactId))) return { error: "You don't have access to this chat." };
  const body = text.trim();
  if (!body) return { error: "Type a message first." };
  if (body.length > 4000) return { error: "Message is too long (4,000 characters max)." };
  const result = await sendText(contactId, body);
  revalidatePath("/portal/whatsapp");
  return result;
}

export async function portalWhatsAppStatus(contactId: string, status: string) {
  if (!(await assertChatAccess(contactId))) return { error: "You don't have access to this chat." };
  if (!["new", "replied", "booked", "lost"].includes(status)) return { error: "Unknown status." };
  const { error } = await db.from("wa_contacts").update({ status }).eq("id", contactId);
  if (error) return { error: error.message };
  revalidatePath("/portal/whatsapp");
  return { ok: true };
}

export async function portalWhatsAppBooking(contactId: string, formData: FormData) {
  if (!(await assertChatAccess(contactId))) return { error: "You don't have access to this chat." };
  const { error } = await db
    .from("wa_contacts")
    .update({ status: "booked", booking: bookingFromForm(formData) })
    .eq("id", contactId);
  if (error) return { error: error.message };
  await sendWhatsAppPurchase(contactId).catch(() => {});
  revalidatePath("/portal/whatsapp");
  revalidatePath("/portal/bookings");
  return { ok: true };
}

export async function portalWhatsAppUpdate(contactId: string, patch: ChatPatch) {
  if (!(await assertChatAccess(contactId))) return { error: "You don't have access to this chat." };
  const result = await updateChat(contactId, patch);
  revalidatePath("/portal/whatsapp");
  return result;
}

export async function portalWhatsAppRead(contactId: string) {
  if (!(await assertChatAccess(contactId))) return;
  await db.from("wa_contacts").update({ unread: 0 }).eq("id", contactId);
}
