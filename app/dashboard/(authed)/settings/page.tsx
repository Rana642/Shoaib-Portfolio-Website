import { PageHeader } from "@/components/dashboard/ui";
import SettingsForm from "@/components/dashboard/SettingsForm";
import { getSettings } from "@/lib/dashboard/settings";
import DomainEmailCheck from "@/components/dashboard/DomainEmailCheck";
import { checkEmailDomain } from "@/lib/dashboard/actions/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business profile" };

// Only business-wide settings live here. Each section keeps its own setup
// in its "Setup" tab: bank accounts, tax and numbering in Finance → Setup,
// access accounts in Clients → Setup, social connections in Marketing.
export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader title="Business profile" description="Your business details, and a check that your email domain is set up right." />
      <div className="space-y-6">
        <SettingsForm settings={settings} part="business" />
        <DomainEmailCheck initialDomain="adsbyshoaib.com" onCheck={checkEmailDomain} />
      </div>
    </>
  );
}
