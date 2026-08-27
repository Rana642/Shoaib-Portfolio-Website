import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/dashboard/db";
import { PageHeader } from "@/components/dashboard/ui";
import AgreementClausesForm from "@/components/dashboard/AgreementClausesForm";
import type { Agreement } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";

export default async function EditAgreementPage({
  params,
}: PageProps<"/dashboard/agreements/[id]/edit">) {
  const { id } = await params;

  const { data } = await db.from("agreements").select("*").eq("id", id).single();
  if (!data) notFound();

  const agreement = data as Agreement;
  // Legacy agreements (created before clauses existed) have no structured
  // content to edit here — they keep rendering their frozen text as-is.
  if (!agreement.clauses) notFound();

  return (
    <>
      <Link
        href={`/dashboard/agreements/${id}`}
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back to {agreement.number}
      </Link>

      <PageHeader title={`Edit ${agreement.number}`} />

      <AgreementClausesForm agreementId={id} clauses={agreement.clauses} />
    </>
  );
}
