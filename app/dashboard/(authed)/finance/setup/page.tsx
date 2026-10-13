import { PageHeader } from "@/components/dashboard/ui";
import SettingsForm from "@/components/dashboard/SettingsForm";
import PaymentAccountsForm from "@/components/dashboard/PaymentAccountsForm";
import { getPaymentAccounts, getSettings } from "@/lib/dashboard/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance setup" };

export default async function FinanceSetupPage() {
  const [settings, accounts] = await Promise.all([getSettings(), getPaymentAccounts()]);

  return (
    <>
      <PageHeader
        title="Finance setup"
        description="Where clients send money, tax defaults, and how your documents are numbered."
      />
      <div className="space-y-6">
        <PaymentAccountsForm accounts={accounts} />
        <SettingsForm settings={settings} part="billing" />
      </div>
    </>
  );
}
