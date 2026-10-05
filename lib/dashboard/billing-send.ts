import "server-only";
import { db } from "./db";
import { formatMoney, formatDate } from "./format";
import { periodLabel, previousPeriod } from "./reports";
import { resend, isResendConfigured, fromEmail, toEmail } from "../resend";
import { billingSentEmail } from "../email-templates";
import { siteUrl } from "../seo";

/**
 * Billing phase 4 — the one click that sends a retainer month to the
 * client. Sending a retainer invoice also sends the matching report (the
 * previous month's), so they always reach the client — and, from phase 5,
 * the portal — together. Nothing happens to drafts until this runs.
 *
 * Not a "use server" file: the authed actions in actions/billing.ts wrap it.
 */

export const invoiceUrl = (token: string) => `${siteUrl}/invoice/${token}`;
export const reportUrl = (token: string) => `${siteUrl}/report/${token}`;

/** Client email + every portal user (owner and members), de-duplicated. */
export async function billingRecipients(clientId: string): Promise<string[]> {
  const [{ data: client }, { data: users }] = await Promise.all([
    db.from("clients").select("email").eq("id", clientId).single(),
    db.from("client_portal_users").select("email").eq("client_id", clientId),
  ]);
  const all = [client?.email, ...(users ?? []).map((u) => u.email)]
    .filter((e): e is string => !!e && e.includes("@"))
    .map((e) => e.trim().toLowerCase());
  return [...new Set(all)];
}

/** The draft report that goes out with a retainer invoice, if any. */
export async function companionReport(invoice: { client_id: string; period?: string | null }) {
  if (!invoice.period) return null;
  const { data } = await db
    .from("client_reports")
    .select("id, period, status, access_token")
    .eq("client_id", invoice.client_id)
    .eq("period", previousPeriod(invoice.period))
    .maybeSingle();
  return data;
}

type SendResult = { ok: true; emailed: string[]; reportSent: boolean } | { error: string };

export async function sendInvoice(invoiceId: string, email: boolean): Promise<SendResult> {
  const { data: invoice } = await db.from("invoices").select("*, clients(name, contact_person)").eq("id", invoiceId).single();
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status === "cancelled") return { error: "This invoice is cancelled." };

  const now = new Date().toISOString();
  if (invoice.status === "draft") {
    const { error } = await db.from("invoices").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", invoiceId);
    if (error) return { error: error.message };
  }

  const report = await companionReport(invoice);
  if (report && report.status === "draft") {
    await db.from("client_reports").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", report.id);
  }

  const emailed = email
    ? await emailClient(invoice.client_id, invoice.clients, {
        invoice: {
          number: invoice.number,
          amount: formatMoney(Number(invoice.total) - Number(invoice.amount_paid ?? 0), invoice.currency),
          due: invoice.due_date ? formatDate(invoice.due_date) : null,
          url: invoiceUrl(invoice.access_token),
          month: invoice.period ? periodLabel(invoice.period) : null,
        },
        report: report ? { month: periodLabel(report.period), url: reportUrl(report.access_token) } : undefined,
        subject: `Invoice ${invoice.number}${report ? ` + ${periodLabel(report.period)} report` : ""} — Ads by Shoaib`,
      })
    : [];
  if (typeof emailed === "string") return { error: emailed };
  return { ok: true, emailed, reportSent: !!report };
}

/** A report on its own (no invoice that month, or sent separately). */
export async function sendReport(reportId: string, email: boolean): Promise<SendResult> {
  const { data: report } = await db.from("client_reports").select("*, clients(name, contact_person)").eq("id", reportId).single();
  if (!report) return { error: "Report not found." };
  const now = new Date().toISOString();
  if (report.status === "draft") {
    const { error } = await db.from("client_reports").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", reportId);
    if (error) return { error: error.message };
  }
  const emailed = email
    ? await emailClient(report.client_id, report.clients, {
        report: { month: periodLabel(report.period), url: reportUrl(report.access_token) },
        subject: `Your ${periodLabel(report.period)} report — Ads by Shoaib`,
      })
    : [];
  if (typeof emailed === "string") return { error: emailed };
  return { ok: true, emailed, reportSent: true };
}

/** Returns who was emailed, or an error message string. */
async function emailClient(
  clientId: string,
  client: { name: string; contact_person: string | null } | null,
  content: {
    invoice?: Parameters<typeof billingSentEmail>[0]["invoice"];
    report?: Parameters<typeof billingSentEmail>[0]["report"];
    subject: string;
  }
): Promise<string[] | string> {
  if (!isResendConfigured) return "Marked as sent, but email isn't set up (RESEND_API_KEY) — share the link instead.";
  const to = await billingRecipients(clientId);
  if (!to.length) return "Marked as sent, but this client has no email or portal users — share the link instead.";
  try {
    await resend.emails.send({
      from: fromEmail,
      to,
      replyTo: toEmail,
      subject: content.subject,
      html: billingSentEmail({
        clientName: client?.contact_person || client?.name || "there",
        invoice: content.invoice,
        report: content.report,
        portalUrl: `${siteUrl}/portal`,
      }),
    });
  } catch (error) {
    console.error("[billing-send] email failed:", error);
    return "Marked as sent, but the email failed — share the link instead.";
  }
  return to;
}
