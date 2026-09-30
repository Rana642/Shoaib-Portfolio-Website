import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { db } from "@/lib/dashboard/db";
import { sendNextBackfillPost } from "@/lib/gbp-backfill";
import { sendNextReply } from "@/lib/gbp-replies";

export const maxDuration = 60;

/**
 * The Google Business sender: at most one write per call, at a human pace —
 * a past planner post being caught up (lib/gbp-backfill.ts) when one is due,
 * otherwise a queued review reply (lib/gbp-replies.ts). While a planner post
 * is due it stands aside, so the day's post gets Google's next free slot
 * (the social cron sends it). Called every 10 minutes by Supabase pg_cron
 * (SQL in supabase/dashboard-schema.sql), with the GitHub Actions workflow
 * (.github/workflows/social-cron.yml) as a backup — protected either way,
 * since it writes to real profiles.
 */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const { data: due } = await db
    .from("scheduled_posts")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", now.toISOString())
    .gte("scheduled_at", new Date(now.getTime() - 2 * 3600 * 1000).toISOString())
    .limit(1);
  if (due?.length) return NextResponse.json({ status: "yield", detail: "a planner post is due" });

  const backfill = await sendNextBackfillPost(now);
  if (backfill.status === "sent" || backfill.status === "failed" || backfill.status === "error") return NextResponse.json({ backfill });
  const reply = await sendNextReply(now);
  return NextResponse.json({ backfill: backfill.status, reply });
}
