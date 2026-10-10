/**
 * The dashboard (admin) and the client portal keep their Supabase sessions
 * in SEPARATE cookies, so the admin and a portal login can be signed in in
 * the same browser at once without one replacing the other. The portal keeps
 * Supabase's default cookie name (existing client sessions stay valid); the
 * dashboard uses its own.
 */
export type AuthArea = "dashboard" | "portal";

export const DASHBOARD_AUTH_COOKIE = "sb-adsbyshoaib-dashboard-auth";

/**
 * Extra Supabase client options for an area's session cookie. `isSingleton:
 * false` matters in the browser: @supabase/ssr otherwise hands back the FIRST
 * client it made and ignores these options, so a portal client could end up
 * writing the dashboard login into the portal cookie (or the reverse).
 */
export function authCookieOptions(area: AuthArea): { cookieOptions?: { name: string }; isSingleton: false } {
  return area === "dashboard" ? { cookieOptions: { name: DASHBOARD_AUTH_COOKIE }, isSingleton: false } : { isSingleton: false };
}
