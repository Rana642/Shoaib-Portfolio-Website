import { PageHeader } from "@/components/dashboard/ui";
import AgreementForm from "@/components/dashboard/AgreementForm";
import { getEligibleProposalsForAgreement } from "@/lib/dashboard/agreements";

export const dynamic = "force-dynamic";
export const metadata = { title: "New agreement" };

export default async function NewAgreementPage() {
  const proposals = await getEligibleProposalsForAgreement();

  return (
    <>
      <PageHeader
        title="New agreement"
        description="Generate a consultation agreement straight from a proposal — for clients who confirm over a call rather than online."
      />
      <AgreementForm proposals={proposals} />
    </>
  );
}
