import { PageHeader } from "@/components/dashboard/ui";
import AccessIdentitiesForm from "@/components/dashboard/AccessIdentitiesForm";
import { getAccessIdentities } from "@/lib/dashboard/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients setup" };

export default async function ClientsSetupPage() {
  const identities = await getAccessIdentities();

  return (
    <>
      <PageHeader title="Clients setup" description="The accounts clients add when they give you access to their pages, ads and profiles." />
      <AccessIdentitiesForm identities={identities} />
    </>
  );
}
