import { PageHeader } from "@/components/dashboard/ui";
import SettingsForm from "@/components/dashboard/SettingsForm";
import { getSettings } from "@/lib/dashboard/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details, tax defaults, and document numbering."
      />
      <SettingsForm settings={settings} />
    </>
  );
}
