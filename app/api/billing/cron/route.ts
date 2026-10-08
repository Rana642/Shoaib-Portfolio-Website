import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { runRetainerBilling, periodLabel } from "@/lib/dashboard/retainers";
import { buildClientReport, previousPeriod } from "@/lib/dashboard/reports";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";
import { retainerDraftsReadyEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/seo";
import { db } from "@/lib/dashboard/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily billing run — Supabase pg_cron calls it every morning (token
 * 'billing' in cron_tokens; SQL in supabase/dashboard-schema.sql), or by
 * hand with CRON_SECRET. On the 1st each active retainer gets a DRAFT
 * invoice; nothing reaches a client until Shoaib sends it. When drafts
 * were created, Shoaib gets one "ready for review" email.
 */
export async function GET(request: Request) {
  if (!(await isCronRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runRetainerBilling();
  const created = results.filter((r) => r.created);
  const failed = results.filter((r) => r.error);

  // Each new invoice brings last month's report as a draft, once per client.
  const reports: { client: string; period: string; ok: boolean }[] = [];
  const seen = new Set<string>();
  for (const r of created) {
    const key = `${r.clientId}:${previousPeriod(r.period)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const report = await buildClientReport(r.clientId, previousPeriod(r.period)).catch((e) => ({ error: String(e) }));
    reports.push({ client: r.retainer, period: previousPeriod(r.period), ok: !("error" in report) });
  }

  if ((created.length || failed.length) && isResendConfigured) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to: toEmail,
        subject: created.length
          ? `${created.length} retainer invoice${created.length === 1 ? "" : "s"} ready for review`
          : "Retainer billing: some invoices couldn't be created",
        html: retainerDraftsReadyEmail({
          url: `${siteUrl}/dashboard/invoices`,
          created: created.map((r) => ({ retainer: r.retainer, month: periodLabel(r.period), invoice: r.invoice! })),
          failed: failed.map((r) => ({ retainer: r.retainer, month: periodLabel(r.period), error: r.error! })),
        }),
      });
    } catch (error) {
      console.error("[billing-cron] notify failed:", error);
    }
  }

  // Daily housekeeping on the same clock: WhatsApp messages keep Meta's full
  // payload (`raw`) for 30 days for debugging, then only the parsed fields.
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  await db.from("wa_messages").update({ raw: null }).lt("sent_at", cutoff).not("raw", "is", null);

  return NextResponse.json({ ok: true, created: created.length, failed: failed.length, results, reports });
}
