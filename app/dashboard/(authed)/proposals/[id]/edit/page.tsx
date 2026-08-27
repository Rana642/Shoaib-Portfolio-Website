import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/ui";
import ProposalForm from "@/components/dashboard/ProposalForm";
import { getProposalFormData } from "@/lib/dashboard/proposals";
import { db } from "@/lib/dashboard/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit proposal" };

export default async function EditProposalPage({
  params,
}: PageProps<"/dashboard/proposals/[id]/edit">) {
  const { id } = await params;

  const [
    { clients, catalog, bundleMembers, clientProjects, settings },
    { data: proposal },
    { data: itemsData },
    { data: projectsData },
  ] = await Promise.all([
    getProposalFormData(),
    db.from("proposals").select("*").eq("id", id).single(),
    db.from("proposal_items").select("*").eq("proposal_id", id).order("sort_order"),
    db.from("proposal_projects").select("*").eq("proposal_id", id).order("sort_order"),
  ]);

  if (!proposal) notFound();

  return (
    <>
      <PageHeader title={`Edit ${proposal.number}`} />
      <ProposalForm
        clients={clients}
        catalog={catalog}
        bundleMembers={bundleMembers}
        clientProjects={clientProjects}
        settings={settings}
        proposal={{ ...proposal, items: itemsData ?? [], projects: projectsData ?? [] }}
      />
    </>
  );
}
