import type { User } from "@supabase/supabase-js";

/**
 * The dashboard is Shoaib's alone — being signed in isn't enough, the user
 * must carry the admin role. It's read from `app_metadata`, which only the
 * service role or SQL can write; never from `user_metadata`, which any
 * signed-in user can edit about themselves. This is what keeps a stray
 * sign-up (or, later, a client-portal user) out of every dashboard page,
 * server action and API route.
 *
 * Grant it in the Supabase SQL Editor:
 *   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
 *   where email = '<admin email>';
 *
 * Kept free of server-only imports so proxy.ts can use it too.
 */
export function isAdmin(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}

/**
 * The client a client-portal user belongs to, or null for anyone else.
 * Both the role and the client id are written into app_metadata by the
 * dashboard's portal invite (lib/dashboard/actions/portal.ts) — the portal
 * scopes every query to this id, server-side.
 */
export function portalClientId(user: Pick<User, "app_metadata"> | null | undefined): string | null {
  const meta = user?.app_metadata;
  return meta?.role === "client" && typeof meta.client_id === "string" ? meta.client_id : null;
}
