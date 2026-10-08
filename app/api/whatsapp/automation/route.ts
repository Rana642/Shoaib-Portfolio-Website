import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { runAutomation } from "@/lib/whatsapp-automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every minute (Supabase pg_cron 'whatsapp-auto', token 'wa_auto'). */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await runAutomation();
  return NextResponse.json({ ok: true, sent: sent.length, results: sent });
}
