import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Hero from "@/components/sections/Hero";
import PainPoints from "@/components/sections/PainPoints";
import ServicesOverview from "@/components/sections/ServicesOverview";
import AboutMini from "@/components/sections/AboutMini";
import CaseStudiesPreview from "@/components/sections/CaseStudiesPreview";
import FAQ from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import TrustSignals from "@/components/sections/TrustSignals";
import Process from "@/components/sections/Process";
import JsonLd from "@/components/shared/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { faqPageSchema } from "@/lib/schema";
import { getFaqs } from "@/lib/faq";
import { getServices } from "@/lib/services";

export const metadata: Metadata = pageMetadata({
  title: "Performance Marketing Consultant for Meta & Google Ads | Shoaib Nabi Noor",
  description:
    "I fix ad accounts that spend but don't sell. Meta and Google Ads, tracking, and funnels, managed by one accountable consultant. Get a free audit.",
  path: "/",
  titleAbsolute: true,
});

export default async function Home() {
  const [faqs, services] = await Promise.all([getFaqs(), getServices()]);

  return (
    <PageWrapper>
      <JsonLd data={faqPageSchema(faqs.map((f) => ({ question: f.q, answer: f.a })))} />
      <Hero />
      <TrustSignals />
      <PainPoints />
      <CaseStudiesPreview />
      <ServicesOverview services={services} />
      <Process />
      <AboutMini />
      <FAQ faqs={faqs} />
      <FinalCTA />
    </PageWrapper>
  );
}
