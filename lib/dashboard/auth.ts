import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdmin } from "./roles";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Auth-only Supabase client, bound to the request's cookies so the login
 * session survives navigation. Uses the anon key deliberately — this
 * client authenticates the user; all dashboard data access goes through
 * the service-role client in db.ts, gated by requireUser().
 */
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
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
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user) ? user : null;
}
