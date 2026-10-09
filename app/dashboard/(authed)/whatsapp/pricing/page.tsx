import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/ui";
import PricingCalculator from "@/components/whatsapp/PricingCalculator";
import { usdToPkr } from "@/lib/fx-rate";

export const metadata = { title: "WhatsApp pricing" };

/** What a client's WhatsApp messages cost per month, by country and message type. */
export default async function WhatsAppPricingPage() {
  const fx = await usdToPkr();
  return (
    <>
      <Link href="/dashboard/whatsapp" className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink mb-4">
        <ArrowLeft className="size-4" aria-hidden /> WhatsApp
      </Link>
      <PageHeader
        title="WhatsApp pricing"
        description="Estimate a client's monthly WhatsApp bill by message type, and what to charge with your margin."
      />
      <PricingCalculator fx={fx} />
    </>
  );
}
