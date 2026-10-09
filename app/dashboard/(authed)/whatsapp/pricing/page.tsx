import { PageHeader } from "@/components/dashboard/ui";
import PricingCalculator from "@/components/whatsapp/PricingCalculator";
import { usdToPkr } from "@/lib/fx-rate";

export const metadata = { title: "WhatsApp pricing" };

/** What a client's WhatsApp messages cost per month, by country and message type. */
export default async function WhatsAppPricingPage() {
  const fx = await usdToPkr();
  return (
    <>
      <PageHeader
        title="WhatsApp pricing"
        description="Estimate a client's monthly WhatsApp bill by message type, and what to charge with your margin."
      />
      <PricingCalculator fx={fx} />
    </>
  );
}
