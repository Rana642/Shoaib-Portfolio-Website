"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getUser } from "../auth";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

/** Removes a contact-form lead. Leads carry no downstream records (a
 *  proposal made from one only copies the name/email/business across, it
 *  doesn't link back), so this is a plain delete — used to clear out
 *  spam or leftover test submissions. */
export async function deleteContact(id: string) {
  await assertAuthed();
  const { error } = await db.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/leads");
  return { ok: true };
}

/** Removes a newsletter subscriber. */
export async function deleteSubscriber(id: string) {
  await assertAuthed();
  const { error } = await db.from("subscribers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/leads");
  return { ok: true };
}
