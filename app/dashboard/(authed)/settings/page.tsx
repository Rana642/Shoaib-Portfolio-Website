import { PageHeader } from "@/components/dashboard/ui";
import SettingsForm from "@/components/dashboard/SettingsForm";
import AccessIdentitiesForm from "@/components/dashboard/AccessIdentitiesForm";
import { getAccessIdentities, getSettings } from "@/lib/dashboard/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, identities] = await Promise.all([getSettings(), getAccessIdentities()]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details, tax defaults, document numbering, and the accounts clients give you access to."
      />
      <SettingsForm settings={settings} />
      <AccessIdentitiesForm identities={identities} />
    </>
  );
}
