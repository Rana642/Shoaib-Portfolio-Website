import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { resendAgreement } from "@/lib/dashboard/actions/agreements";
import { StatusBadge, Card } from "@/components/dashboard/ui";
import ResendAgreementButton from "@/components/dashboard/ResendAgreementButton";
import type { Agreement } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function AgreementPage({ params }: PageProps<"/dashboard/agreements/[id]">) {
  const { id } = await params;

  const { data } = await db.from("agreements").select("*, clients(name)").eq("id", id).single();
  if (!data) notFound();

  const { clients, ...agreement } = data as Agreement & { clients: { name: string } | null };

  async function resend() {
    "use server";
    return resendAgreement(id);
  }

  return (
    <>
      <Link
        href="/dashboard/agreements"
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All agreements
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1 className="font-serif italic text-h2">{agreement.number}</h1>
        <StatusBadge status={agreement.status} />
      </div>
      <p className="text-small text-ink-muted mb-8">{clients?.name ?? "—"}</p>

      {agreement.status !== "signed" && agreement.status !== "declined" && (
        <div className="mb-8">
          <ResendAgreementButton onResend={resend} />
        </div>
      )}

      <Card className="p-8">
        <p className="text-body whitespace-pre-line">{agreement.content}</p>
      </Card>

      {agreement.signer_name && (
        <p className="text-small text-ink-muted mt-6">
          Signed by <span className="font-medium text-ink">{agreement.signer_name}</span>
          {agreement.signed_at && ` on ${new Date(agreement.signed_at).toLocaleString()}`}
        </p>
      )}
    </>
  );
}
