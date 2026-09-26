"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { isAdmin, portalClientId } from "../roles";
import { findAuthUserByEmail, portalWelcomeUrl, PORTAL_SETUP_MESSAGE } from "../portal-users";
import { resend, isResendConfigured, fromEmail } from "../../resend";
import { portalInviteEmail } from "../../email-templates";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

const inviteSchema = z.object({
  clientId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

/**
 * Gives someone at a client access to the portal: creates their login (or
 * reuses theirs), stamps the client role + client id into app_metadata —
 * server-side, the only place it can be set — and emails a branded
 * "set your password" link. Also used to resend an invite.
 */
export async function inviteToPortal(clientId: string, email: string) {
  await assertAuthed();
  const parsed = inviteSchema.safeParse({ clientId, email });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const target = parsed.data.email;

  if (!isResendConfigured) return { error: "Email isn't set up (RESEND_API_KEY is missing)." };
  const { error: probe } = await db.from("client_portal_users").select("id").limit(1);
  if (probe) return { error: probe.code === "PGRST205" ? PORTAL_SETUP_MESSAGE : probe.message };

  const { data: client } = await db
    .from("clients")
    .select("id, name, email, contact_person")
    .eq("id", parsed.data.clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found." };

  // A new email gets an invite; an existing portal login gets a "set your
  // password" (recovery) link instead — Supabase won't invite twice.
  const existing = await findAuthUserByEmail(target);
  if (existing) {
    if (isAdmin(existing)) return { error: "That's your own admin login — use a different email for the portal." };
    const owner = portalClientId(existing);
    if (owner !== client.id) {
      return {
        error: owner
          ? "This email already has portal access for another client."
          : "This email already has a login that isn't a portal login.",
      };
    }
  }
  const type = existing ? "recovery" : "invite";

  const { data: link, error: linkError } = await db.auth.admin.generateLink({ type, email: target });
  if (linkError || !link?.user) return { error: linkError?.message ?? "Couldn't create the invite link." };

  // This is what opens /portal to them — and nothing else (not /dashboard).
  const { error: roleError } = await db.auth.admin.updateUserById(link.user.id, {
    app_metadata: { role: "client", client_id: client.id },
  });
  if (roleError) return { error: roleError.message };

  const { error: rowError } = await db
    .from("client_portal_users")
    .upsert(
      { client_id: client.id, user_id: link.user.id, email: target, last_invited_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (rowError) return { error: rowError.message };

  const name = client.email?.toLowerCase() === target && client.contact_person ? client.contact_person : "there";
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: target,
    subject: `Your ${client.name} client portal`,
    html: portalInviteEmail({ name, clientName: client.name, url: portalWelcomeUrl(link.properties.hashed_token, type) }),
  });
  revalidatePath(`/dashboard/clients/${client.id}`);
  if (sendError) {
    console.error("[portal] Resend failed:", sendError);
    return { error: "Access was set up, but the email didn't send — try Resend." };
  }
  return { ok: true };
}

/** Removes a person's portal access for good: deletes their login, which
 *  also ends any session they have open. */
export async function removePortalUser(memberId: string) {
  await assertAuthed();
  if (!z.string().uuid().safeParse(memberId).success) return { error: "Not found." };

  const { data: member } = await db
    .from("client_portal_users")
    .select("id, client_id, user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: "Not found." };

  const { data: auth } = await db.auth.admin.getUserById(member.user_id);
  // Never delete anything but a portal login — a guard against a bad row.
  if (auth?.user && !portalClientId(auth.user)) return { error: "That login isn't a portal login — not removed." };
  if (auth?.user) {
    const { error } = await db.auth.admin.deleteUser(member.user_id);
    if (error) return { error: error.message };
  }
  await db.from("client_portal_users").delete().eq("id", member.id);
  revalidatePath(`/dashboard/clients/${member.client_id}`);
  return { ok: true };
}
