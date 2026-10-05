import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/dashboard/db";
import { getAdminUser } from "@/lib/dashboard/auth";
import { periodLabel, type ClientReport } from "@/lib/dashboard/reports";
import ReportView from "@/components/report/ReportView";
import PrintButton from "@/components/report/PrintButton";

export const dynamic = "force-dynamic";

// Token-gated client document — never indexed.
export const metadata: Metadata = { title: "Monthly report", robots: { index: false, follow: false } };

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32,80}$/.test(token)) notFound();

  const { data } = await db.from("client_reports").select("*, clients(name)").eq("access_token", token).maybeSingle();
  if (!data) notFound();
  const report = data as ClientReport & { clients: { name: string } | null };

  // Drafts exist only for Shoaib until he sends them.
  if (report.status !== "sent" && !(await getAdminUser())) notFound();

  return (
    <main className="min-h-full bg-cloud px-5 py-10 md:py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-end mb-6 print:hidden">
          <PrintButton />
        </div>
        <ReportView
          clientName={report.clients?.name ?? ""}
          periodLabel={periodLabel(report.period)}
          summary={report.summary}
          sections={report.sections}
        />
      </div>
    </main>
  );
}
