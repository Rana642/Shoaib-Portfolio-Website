import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { runAutomation } from "@/lib/whatsapp/automation";
import { runBroadcasts } from "@/lib/whatsapp/broadcasts";
import { syncAllProjectContacts } from "@/lib/portal/contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every minute (Supabase pg_cron 'whatsapp-auto', token 'wa_auto'): auto-replies, then the next broadcast batch. Twice an hour it also refreshes the portal contact books. */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await runAutomation();
  const broadcasts = await runBroadcasts();
  const contacts = new Date().getMinutes() % 30 === 0 ? await syncAllProjectContacts().catch(() => ({ projects: 0, failed: -1 })) : null;
  return NextResponse.json({ ok: true, sent: sent.length, results: sent, broadcasts, contacts });
}
