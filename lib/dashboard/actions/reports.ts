"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { getAdminUser } from "../auth";
import { buildClientReport } from "../reports";

async function assertAuthed() {
  const user = await getAdminUser();
  if (!user) redirect("/dashboard/login");
}

/** "New report": build (or open) a client's report for a month. */
export async function createReport(formData: FormData) {
  await assertAuthed();
  const clientId = String(formData.get("client_id") ?? "");
  const period = String(formData.get("period") ?? "");
  if (!clientId || !/^\d{4}-\d{2}$/.test(period)) return { error: "Pick a client and a month." };
  const result = await buildClientReport(clientId, period);
  if ("error" in result) {
    // Already sent — open it instead.
    const { data } = await db.from("client_reports").select("id").eq("client_id", clientId).eq("period", period).maybeSingle();
    if (data) redirect(`/dashboard/reports/${data.id}`);
    return { error: result.error };
  }
  revalidatePath("/dashboard/reports");
  redirect(`/dashboard/reports/${result.id}`);
}

/** Re-pull every number and work log for a draft (summary is kept). */
export async function refreshReport(id: string) {
  await assertAuthed();
  const { data: report } = await db.from("client_reports").select("client_id, period").eq("id", id).single();
  if (!report) return { error: "Report not found." };
  const result = await buildClientReport(report.client_id, report.period);
  if ("error" in result) return { error: result.error };
  revalidatePath(`/dashboard/reports/${id}`);
  return { ok: true };
}

export async function updateReportSummary(id: string, summary: string) {
  await assertAuthed();
  const { data: report } = await db.from("client_reports").select("status").eq("id", id).single();
  if (report?.status === "sent") return { error: "This report was already sent." };
  const { error } = await db
    .from("client_reports")
    .update({ summary: summary.trim().slice(0, 5000) || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/reports/${id}`);
  return { ok: true };
}

const digits = z
  .string()
  .trim()
  .transform((v) => v.replace(/-/g, ""))
  .refine((v) => v === "" || /^\d+$/.test(v), "Use digits only");

const sourcesSchema = z.object({
  google_ads_customer_id: digits,
  google_ads_login_customer_id: digits,
  meta_ad_account_id: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(act_)?\d+$/.test(v), "Meta ad account looks like act_123…"),
  meta_campaign_filter: z.string().trim().max(100),
  ga4_property_id: digits,
});

/** Where a project's report numbers come from. */
export async function updateReportSources(projectId: string, reportId: string, formData: FormData) {
  await assertAuthed();
  const parsed = sourcesSchema.safeParse({
    google_ads_customer_id: formData.get("google_ads_customer_id") ?? "",
    google_ads_login_customer_id: formData.get("google_ads_login_customer_id") ?? "",
    meta_ad_account_id: formData.get("meta_ad_account_id") ?? "",
    meta_campaign_filter: formData.get("meta_campaign_filter") ?? "",
    ga4_property_id: formData.get("ga4_property_id") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const sources = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== ""));
  const { error } = await db.from("client_projects").update({ report_sources: sources }).eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/reports/${reportId}`);
  return { ok: true };
}
