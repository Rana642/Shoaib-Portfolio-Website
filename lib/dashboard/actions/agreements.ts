"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../db";
import { getUser } from "../auth";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { agreementReadyEmail } from "../../email-templates";
import { siteUrl } from "../../seo";

async function assertAuthed() {
  const user = await getUser();
  if (!user) redirect("/dashboard/login");
}

/** Staff re-send — the agreement's content is a frozen snapshot, so
 *  resending never regenerates it, just re-delivers the same link. */
export async function resendAgreement(id: string) {
  await assertAuthed();

  const { data: agreement } = await db
    .from("agreements")
    .select("*, clients(name, email)")
    .eq("id", id)
    .single();

  if (!agreement) return { error: "Agreement not found." };
  const client = agreement.clients as { name: string; email: string | null } | null;
  if (!client?.email) return { error: "This client has no email on file." };

  if (isResendConfigured) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: client.email,
        subject: "Your consultation agreement",
        html: agreementReadyEmail({
          name: client.name,
          url: `${siteUrl}/agreement/${agreement.access_token}`,
        }),
      });
    } catch (sendError) {
      console.error("[agreements] Resend failed:", sendError);
      return { error: "Couldn't send the email. Check Resend configuration." };
    }
  }

  revalidatePath(`/dashboard/agreements/${id}`);
  return { ok: true };
}
