"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { sendText } from "../../whatsapp";

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

/** Opening a chat clears its unread badge. */
export async function markWhatsAppRead(contactId: string) {
  await assertAuthed();
  await db.from("wa_contacts").update({ unread: 0 }).eq("id", contactId);
}
