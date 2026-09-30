import { NextResponse } from "next/server";
import { sendNextReply } from "@/lib/gbp-replies";

export const maxDuration = 60;

/**
 * Sends at most one queued Google Business review reply per call, at a human
 * pace (see lib/gbp-replies.ts). Called every 10 minutes by Supabase pg_cron
 * (SQL in supabase/dashboard-schema.sql), with the GitHub Actions workflow
 * (.github/workflows/social-cron.yml) as a backup — protected by CRON_SECRET,
 * like /api/social/cron, since it writes to real profiles.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendNextReply();
  return NextResponse.json(result);
}
