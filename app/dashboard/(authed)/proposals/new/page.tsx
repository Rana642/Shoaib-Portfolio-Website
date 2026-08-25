import { PageHeader } from "@/components/dashboard/ui";
import ProposalForm from "@/components/dashboard/ProposalForm";
import { getProposalFormData } from "@/lib/dashboard/proposals";

export const dynamic = "force-dynamic";
export const metadata = { title: "New proposal" };

export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; email?: string; business?: string }>;
}) {
  const { clients, catalog, settings } = await getProposalFormData();
  const params = await searchParams;

  return (
    <>
      <PageHeader title="New proposal" />
      <ProposalForm
        clients={clients}
        catalog={catalog}
        settings={settings}
        prefill={{ name: params.name, email: params.email, business: params.business }}
      />
    </>
  );
}
