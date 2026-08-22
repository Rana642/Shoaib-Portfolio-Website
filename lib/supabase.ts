import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseConfigured = Boolean(url && serviceRoleKey);

/**
 * Service-role client — bypasses RLS. Server-only: import this from API
 * routes, never from client components. Placeholder values keep
 * construction valid before Shoaib adds real Supabase credentials;
 * isSupabaseConfigured gates every actual query.
 */
export const supabaseAdmin = createClient(
  url || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key"
);
