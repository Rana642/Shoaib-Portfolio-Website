import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";
import { sendNextReply } from "@/lib/gbp-replies";

export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Supabase pg_cron's token: generated inside the database and kept in
 *  cron_tokens (RLS on, no policies — only the service role reads it), so
 *  no secret ever has to be copied between Vercel and Supabase. */
async function isSupabaseCron(bearer: string) {
  if (bearer.length < 32) return false;
  const { data } = await db.from("cron_tokens").select("token").eq("name", "gbp_reply").maybeSingle();
  return typeof data?.token === "string" && same(bearer, data.token);
}

/**
 * Sends at most one queued Google Business review reply per call, at a human
 * pace (see lib/gbp-replies.ts). Called every 10 minutes by Supabase pg_cron
 * (SQL in supabase/dashboard-schema.sql) with its own token, and by the
 * GitHub Actions workflow (.github/workflows/social-cron.yml) with
 * CRON_SECRET as a backup — protected either way, since it writes to real
 * profiles.
 */
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const secret = process.env.CRON_SECRET;
  const ok = (secret && bearer && same(bearer, secret)) || (await isSupabaseCron(bearer));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendNextReply();
  return NextResponse.json(result);
}
