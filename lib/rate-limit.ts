import { supabaseAdmin, isSupabaseConfigured } from "./supabase";

/**
 * Shared per-key rate limit backed by a Postgres function, so it works
 * across serverless instances (which don't share memory). Returns true if
 * the request is allowed. Fails OPEN — if the limiter itself errors, real
 * users are never blocked; it's a spam/abuse/cost brake, not an auth gate.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/**
 * Client IP for rate-limit keys. Prefers `x-real-ip`, which Vercel's edge
 * sets to the true connecting IP and a client cannot forge. The leftmost
 * `x-forwarded-for` entry is client-supplied and spoofable — using it would
 * let an attacker rotate fake IPs to slip past the limiter — so it's only a
 * last-resort fallback for non-Vercel/local environments.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
