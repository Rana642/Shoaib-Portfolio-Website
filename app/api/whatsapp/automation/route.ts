import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { runAutomation } from "@/lib/whatsapp-automation";
import { runBroadcasts } from "@/lib/whatsapp-broadcasts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every minute (Supabase pg_cron 'whatsapp-auto', token 'wa_auto'): auto-replies, then the next broadcast batch. */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await runAutomation();
  const broadcasts = await runBroadcasts();
  return NextResponse.json({ ok: true, sent: sent.length, results: sent, broadcasts });
}
