import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { Card, StatusBadge } from "@/components/dashboard/ui";
import { ReportControls, ReportSourcesForm } from "@/components/dashboard/ReportEditor";
import ReportView from "@/components/report/ReportView";
import { refreshReport, updateReportSummary, updateReportSources } from "@/lib/dashboard/actions/reports";
import { periodLabel, type ClientReport, type ReportSources } from "@/lib/dashboard/reports";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await db.from("client_reports").select("*, clients(name)").eq("id", id).single();
  if (!data) notFound();
  const report = data as ClientReport & { clients: { name: string } | null };

  const { data: projects } = await db
    .from("client_projects")
    .select("id, name, report_sources")
    .eq("client_id", report.client_id)
    .order("sort_order");

  const locked = report.status === "sent";
  const errorsByProject = new Map(report.sections.map((s) => [s.project_id, s.errors]));

  async function saveSummary(summary: string) {
    "use server";
    return updateReportSummary(id, summary);
  }
  async function refresh() {
    "use server";
    return refreshReport(id);
  }

  return (
    <>
      <div className="print:hidden">
        <Link
          href="/dashboard/reports"
          className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
          All reports
        </Link>

        <div className="flex flex-wrap items-center gap-4 mb-2">
          <h1 className="font-serif italic text-h2">
            {report.clients?.name} — {periodLabel(report.period)}
          </h1>
          <StatusBadge status={report.status} />
        </div>
        <p className="text-small text-ink-muted mb-8">
          {report.generated_at && `Numbers pulled ${new Date(report.generated_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" })}. `}
          Work done comes from each project&apos;s knowledge-base log for the month.
        </p>

        <Card className="p-6 mb-6">
          <ReportControls summary={report.summary ?? ""} locked={locked} onSaveSummary={saveSummary} onRefresh={refresh} />
        </Card>

        {!locked && (
          <Card className="p-6 mb-10">
            <h2 className="text-body-lg font-medium mb-1">Data sources</h2>
            <p className="text-small text-ink-muted mb-4">
              Google Business Profile and social posts are found automatically. Set ad accounts and GA4 per project.
            </p>
            <div className="space-y-3">
              {(projects ?? []).map((p) => {
                async function saveSources(formData: FormData) {
                  "use server";
                  return updateReportSources(p.id, id, formData);
                }
                return (
                  <ReportSourcesForm
                    key={p.id}
                    projectName={p.name}
                    sources={(p.report_sources ?? {}) as ReportSources}
                    errors={errorsByProject.get(p.id) ?? []}
                    onSave={saveSources}
                  />
                );
              })}
            </div>
          </Card>
        )}

        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">What the client sees</p>
      </div>

      <ReportView
        clientName={report.clients?.name ?? ""}
        periodLabel={periodLabel(report.period)}
        summary={report.summary}
        sections={report.sections}
      />
    </>
  );
}
