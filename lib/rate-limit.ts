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

/** Best-effort client IP from the proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
