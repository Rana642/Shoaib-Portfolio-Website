import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { isAdmin } from "./roles";
import { authCookieOptions, type AuthArea } from "../auth-cookies";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Auth-only Supabase client, bound to the request's cookies so the login
 * session survives navigation. Uses the anon key deliberately — this
 * client authenticates the user; all dashboard data access goes through
 * the service-role client in db.ts, gated by requireUser().
 */
export async function createAuthClient(area: AuthArea = "dashboard") {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    ...authCookieOptions(area),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The signed-in dashboard ADMIN, or null — for anyone signed out, or signed
 * in without the admin role (see roles.ts), the dashboard doesn't exist.
 * Every dashboard page, server action and API route gates on this.
 */
export async function getAdminUser() {
  const user = await getSessionUser();
  return isAdmin(user) ? user : null;
}

/** What the app needs from a session: who, their email, and their role. */
export type SessionUser = Pick<User, "id" | "email" | "app_metadata">;

/**
 * The signed-in user from the session's JWT, verified LOCALLY with the
 * project's ES256 public key (getClaims) — no round-trip to Supabase Auth
 * on every page and action, which was the main source of dashboard and
 * portal lag. Expired tokens are still refreshed. Memoised per request, so
 * a layout, its page and their actions check once.
 */
export const getSessionUser = cache(async (area: AuthArea = "dashboard"): Promise<SessionUser | null> => {
  const supabase = await createAuthClient(area);
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    app_metadata: (claims.app_metadata ?? {}) as User["app_metadata"],
  };
});
