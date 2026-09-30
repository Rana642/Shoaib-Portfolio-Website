import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "./dashboard/db";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Whether a request comes from one of the site's schedulers: the GitHub
 * Actions workflow (CRON_SECRET) or Supabase pg_cron, whose tokens are
 * generated inside the database and kept in cron_tokens (RLS on, no
 * policies — only the service role reads them), so no secret ever has to
 * be copied between Vercel and Supabase. SQL in supabase/dashboard-schema.sql.
 */
export async function isCronRequest(request: Request): Promise<boolean> {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!bearer) return false;
  const secret = process.env.CRON_SECRET;
  if (secret && same(bearer, secret)) return true;
  if (bearer.length < 32) return false;
  const { data } = await db.from("cron_tokens").select("token");
  return ((data ?? []) as { token: string }[]).some((r) => typeof r.token === "string" && same(bearer, r.token));
}
