"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { bookingFromForm, sendText } from "../../whatsapp";

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
  revalidatePath("/dashboard/whatsapp");
  return { ok: true };
}

/** Opening a chat clears its unread badge. */
export async function markWhatsAppRead(contactId: string) {
  await assertAuthed();
  await db.from("wa_contacts").update({ unread: 0 }).eq("id", contactId);
}
