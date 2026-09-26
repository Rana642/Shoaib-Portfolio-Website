import "server-only";
import type { User } from "@supabase/supabase-js";
import { db } from "./db";
import { siteUrl } from "../seo";

export const PORTAL_SETUP_MESSAGE =
  "The client portal needs a one-time database update — run the “Client portal” section of supabase/dashboard-schema.sql in the Supabase SQL Editor.";

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

export type PortalMember = {
  id: string;
  email: string;
  invitedAt: string;
  /** null until they've set a password and signed in. */
  lastSignInAt: string | null;
};

/** Who can sign in to a client's portal, for the dashboard's client page. */
export async function listPortalMembers(clientId: string): Promise<{ members: PortalMember[]; needsSetup: boolean }> {
  const { data, error } = await db
    .from("client_portal_users")
    .select("id, user_id, email, last_invited_at")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) return { members: [], needsSetup: error.code === "PGRST205" };

  const members = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: auth } = await db.auth.admin.getUserById(row.user_id);
      return {
        id: row.id as string,
        email: row.email as string,
        invitedAt: row.last_invited_at as string,
        lastSignInAt: auth?.user?.last_sign_in_at ?? null,
      };
    })
  );
  return { members, needsSetup: false };
}
