import { NextResponse } from "next/server";
import { db } from "@/lib/dashboard/db";

/**
 * Public uptime check for an external monitor (UptimeRobot, every 5 min).
 * Answers 503 when the database API doesn't respond — on 29 Oct 2026
 * Supabase's API hung for 11 hours (PGRST003, "Timed out acquiring
 * connection from connection pool") and nothing told anyone — or when
 * posts are piling up because the posting cron isn't getting through them.
 * Says nothing private: just which check failed.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** PostgREST waits ~60 s for a connection before giving up; don't. */
const DB_TIMEOUT_MS = 8_000;
/** A post this late that isn't held on purpose means posting has stalled. */
const LATE_AFTER_MS = 2 * 3600_000;

export async function GET() {
  const checks: Record<string, string> = {};
  try {
    const { data, error } = await db
      .from("scheduled_posts")
      .select("id, result")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date(Date.now() - LATE_AFTER_MS).toISOString())
      .limit(50)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (error) throw new Error(error.message);
    checks.database = "ok";
    // Held posts (a blocked login, an API limit) wait on purpose — not a stall.
    const late = (data ?? []).filter((p) => !(p.result as { held?: unknown } | null)?.held).length;
    checks.posting = late ? `${late} post${late === 1 ? "" : "s"} more than 2 hours late` : "ok";
  } catch (e) {
    checks.database = `no answer (${e instanceof Error ? e.message : String(e)})`;
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
