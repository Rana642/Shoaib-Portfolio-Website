import { PageHeader } from "@/components/dashboard/ui";
import SettingsForm from "@/components/dashboard/SettingsForm";
import AccessIdentitiesForm from "@/components/dashboard/AccessIdentitiesForm";
import PaymentAccountsForm from "@/components/dashboard/PaymentAccountsForm";
import { getAccessIdentities, getPaymentAccounts, getSettings } from "@/lib/dashboard/settings";
import DomainEmailCheck from "@/components/dashboard/DomainEmailCheck";
import { checkEmailDomain } from "@/lib/dashboard/actions/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, identities, accounts] = await Promise.all([getSettings(), getAccessIdentities(), getPaymentAccounts()]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details, tax defaults, document numbering, payment accounts, and the accounts clients give you access to."
      />
      <SettingsForm settings={settings} />
      <PaymentAccountsForm accounts={accounts} />
      <AccessIdentitiesForm identities={identities} />
      <DomainEmailCheck initialDomain="adsbyshoaib.com" onCheck={checkEmailDomain} />
    </>
  );
}
