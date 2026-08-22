import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * Service-role client for all dashboard data. Bypasses RLS, so it must
 * only ever be reached from server code behind an auth check — the
 * `server-only` import above makes bundling it into a client component a
 * build error rather than a silent key leak.
 */
export const db = createClient(
  url || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key",
  { auth: { persistSession: false } }
);
