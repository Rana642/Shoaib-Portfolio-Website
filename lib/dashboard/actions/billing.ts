"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "../auth";
import { sendInvoice, sendReport } from "../billing-send";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

export async function sendInvoiceToClient(id: string, email: boolean) {
  await assertAuthed();
  const result = await sendInvoice(id, email);
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/reports");
  if ("error" in result) return { error: result.error };
  return { ok: true };
}

export async function sendReportToClient(id: string, email: boolean) {
  await assertAuthed();
  const result = await sendReport(id, email);
  revalidatePath(`/dashboard/reports/${id}`);
  revalidatePath("/dashboard/reports");
  if ("error" in result) return { error: result.error };
  return { ok: true };
}
