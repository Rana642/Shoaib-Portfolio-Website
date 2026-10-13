import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import HowToPay from "@/components/pay/HowToPay";
import ReceiptUploadForm from "@/components/pay/ReceiptUploadForm";
import { pageMetadata } from "@/lib/seo";
import { getPaymentAccounts } from "@/lib/dashboard/settings";
import { paymentBlocks } from "@/lib/payment-accounts";

// A utility page for clients (bank details + receipt upload) — never indexed.
export const metadata: Metadata = {
  ...pageMetadata({ title: "Pay", description: "Bank details for paying Ads by Shoaib, and a place to upload your payment receipt.", path: "/pay" }),
  robots: { index: false, follow: false },
};

export const revalidate = 3600;

export default async function PayPage() {
  const accounts = await getPaymentAccounts();
  const blocks = paymentBlocks(accounts);

  return (
    <PageWrapper>
      <section className="py-14 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <Tag>Payments</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              Make a payment<span className="text-citrus">.</span>
            </h1>
            <p className="text-body text-ink-muted mt-4 max-w-2xl">
              Send your payment by bank transfer to the account below, then upload the receipt here. I&apos;ll check it and
              confirm. If you have an invoice link, you can also pay and upload the receipt from there.
            </p>
          </Reveal>

          <div className="mt-12 max-w-3xl grid gap-6">
            <HowToPay blocks={blocks} note={accounts.note} title="Bank details" />
            <ReceiptUploadForm />
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
