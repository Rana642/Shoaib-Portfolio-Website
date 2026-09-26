import "server-only";
import type { User } from "@supabase/supabase-js";
import { db } from "./db";
import { isAdmin, portalClientId } from "./roles";
import { siteUrl } from "../seo";
import { resend, isResendConfigured, fromEmail } from "../resend";
import { portalInviteEmail } from "../email-templates";
import { DEFAULT_CLIENT_FEATURES, isFeature, type PortalFeature, type PortalRole } from "../portal/features";

export const PORTAL_SETUP_MESSAGE =
  "The client portal needs a one-time database update — run the “Client portal” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";
export const ROLES_SETUP_MESSAGE =
  "Portal roles need a one-time database update — run the “Client portal roles” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";

// Postgres "undefined column": the roles SQL hasn't been run yet.
const MISSING_COLUMN = "42703";

/**
 * The link emailed for an invite or a password reset. It opens a page that
 * asks for the new password; the one-time token is only redeemed when that
 * form is submitted — never on page load — so email security scanners that
 * pre-open links can't use it up. Always the real site URL, never the
 * request's Host header, which an attacker could spoof.
 */
export function portalWelcomeUrl(tokenHash: string, type: "invite" | "recovery") {
  return `${siteUrl}/portal/welcome?token=${encodeURIComponent(tokenHash)}&type=${type}`;
}

/** Looks a login up by email (the admin API has no direct lookup). */
export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** The features Shoaib has turned on for a client's portal. */
export async function getClientFeatures(clientId: string): Promise<PortalFeature[]> {
  const { data, error } = await db.from("clients").select("portal_features").eq("id", clientId).maybeSingle();
  if (error || !data) return DEFAULT_CLIENT_FEATURES;
  return ((data.portal_features as string[] | null) ?? []).filter(isFeature);
}

export type PortalMember = {
  id: string;
  userId: string;
  email: string;
  role: PortalRole;
  /** A member's ticked features (an Owner's come from the client). */
  permissions: string[];
  /** null = every project. */
  projectIds: string[] | null;
  invitedAt: string;
  /** null until they've set a password and signed in. */
  lastSignInAt: string | null;
};

type MemberRow = {
  id: string;
  user_id: string;
  email: string;
  last_invited_at: string;
  role?: string;
  permissions?: string[] | null;
  project_ids?: string[] | null;
};

const toMember = (row: MemberRow, lastSignInAt: string | null = null): PortalMember => ({
  id: row.id,
  userId: row.user_id,
  email: row.email,
  role: row.role === "member" ? "member" : "owner",
  permissions: row.permissions ?? [],
  projectIds: row.project_ids ?? null,
  invitedAt: row.last_invited_at,
  lastSignInAt,
});

const FULL = "id, user_id, email, last_invited_at, role, permissions, project_ids";
const BASIC = "id, user_id, email, last_invited_at";

/** A portal login's membership row (who they are to their client). Before
 *  the roles SQL runs, everyone reads as an Owner. */
export async function loadPortalMember(userId: string): Promise<PortalMember | null> {
  const full = await db.from("client_portal_users").select(FULL).eq("user_id", userId).maybeSingle();
  let row = full.data as MemberRow | null;
  let error = full.error;
  if (error?.code === MISSING_COLUMN) {
    const basic = await db.from("client_portal_users").select(BASIC).eq("user_id", userId).maybeSingle();
    row = basic.data as MemberRow | null;
    error = basic.error;
  }
  return !error && row ? toMember(row) : null;
}

/** Who can sign in to a client's portal. */
export async function listPortalMembers(
  clientId: string
): Promise<{ members: PortalMember[]; needsSetup: boolean; rolesReady: boolean }> {
  let rolesReady = true;
  const full = await db.from("client_portal_users").select(FULL).eq("client_id", clientId).order("created_at");
  let rows = full.data as MemberRow[] | null;
  let error = full.error;
  if (error?.code === MISSING_COLUMN) {
    rolesReady = false;
    const basic = await db.from("client_portal_users").select(BASIC).eq("client_id", clientId).order("created_at");
    rows = basic.data as MemberRow[] | null;
    error = basic.error;
  }
  if (error) return { members: [], needsSetup: error.code === "PGRST205", rolesReady };

  const members = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: auth } = await db.auth.admin.getUserById(row.user_id);
      return toMember(row, auth?.user?.last_sign_in_at ?? null);
    })
  );
  return { members, needsSetup: false, rolesReady };
}

/**
 * Gives someone portal access and emails them a "set your password" link.
 * Shared by the dashboard (Shoaib: any role) and the portal (an Owner:
 * members only) — both callers check who's asking before calling this.
 * The login's app_metadata gets role "client" + the client id (the only
 * thing that opens /portal); role, ticks and projects live in the row, so
 * changing them takes effect at once.
 */
export async function createPortalInvite(opts: {
  clientId: string;
  email: string;
  role: PortalRole;
  permissions: string[];
  projectIds: string[] | null;
  /** The Owner who invited them (portal), or null for Shoaib. */
  invitedBy: { userId: string; email: string } | null;
}): Promise<{ ok: true } | { error: string }> {
  const target = opts.email.trim().toLowerCase();
  if (!isResendConfigured) return { error: "Email isn't set up (RESEND_API_KEY is missing)." };

  const { data: client } = await db
    .from("clients")
    .select("id, name, email, contact_person")
    .eq("id", opts.clientId)
    .maybeSingle();
  if (!client) return { error: "Client not found." };

  // A new email gets an invite; an existing portal login of this client
  // gets a fresh "set your password" (recovery) link.
  const existing = await findAuthUserByEmail(target);
  if (existing) {
    if (isAdmin(existing)) return { error: "That's the admin login — use a different email for the portal." };
    const owner = portalClientId(existing);
    if (owner !== client.id) {
      return {
        error: owner
          ? "This email already has portal access for another client."
          : "This email already has a login that isn't a portal login.",
      };
    }
    if (opts.invitedBy) {
      // An Owner can't change another Owner's access.
      const row = await loadPortalMember(existing.id);
      if (row?.role === "owner") return { error: "This person is already an Owner of this portal." };
    }
  }
  const type = existing ? "recovery" : "invite";

  const { data: link, error: linkError } = await db.auth.admin.generateLink({ type, email: target });
  if (linkError || !link?.user) return { error: linkError?.message ?? "Couldn't create the invite link." };

  const { error: roleError } = await db.auth.admin.updateUserById(link.user.id, {
    app_metadata: { role: "client", client_id: client.id },
  });
  if (roleError) return { error: roleError.message };

  const { error: rowError } = await db.from("client_portal_users").upsert(
    {
      client_id: client.id,
      user_id: link.user.id,
      email: target,
      last_invited_at: new Date().toISOString(),
      role: opts.role,
      permissions: opts.role === "owner" ? [] : opts.permissions,
      project_ids: opts.role === "owner" ? null : opts.projectIds,
      invited_by: opts.invitedBy?.userId ?? null,
    },
    { onConflict: "user_id" }
  );
  if (rowError) return { error: rowError.code === "PGRST204" ? ROLES_SETUP_MESSAGE : rowError.message };

  const name = client.email?.toLowerCase() === target && client.contact_person ? client.contact_person : "there";
  const { error: sendError } = await resend.emails.send({
    from: fromEmail,
    to: target,
    subject: `Your ${client.name} client portal`,
    html: portalInviteEmail({
      name,
      clientName: client.name,
      url: portalWelcomeUrl(link.properties.hashed_token, type),
      invitedBy: opts.invitedBy?.email,
    }),
  });
  if (sendError) {
    console.error("[portal] invite email failed:", sendError);
    return { error: "Access was set up, but the email didn't send — try resending." };
  }
  return { ok: true };
}

/** Deletes a portal login for good (ends any open session too). Refuses
 *  anything that isn't a portal login of this very client. */
export async function deletePortalLogin(member: PortalMember, clientId: string): Promise<{ ok: true } | { error: string }> {
  const { data: auth } = await db.auth.admin.getUserById(member.userId);
  if (auth?.user) {
    if (portalClientId(auth.user) !== clientId) return { error: "That login isn't a portal login of this client — not removed." };
    const { error } = await db.auth.admin.deleteUser(member.userId);
    if (error) return { error: error.message };
  }
  await db.from("client_portal_users").delete().eq("id", member.id);
  return { ok: true };
}
