import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Hero from "@/components/sections/Hero";
import PainPoints from "@/components/sections/PainPoints";
import Turn from "@/components/sections/Turn";
import ServicesOverview from "@/components/sections/ServicesOverview";
import WhyChooseUs from "@/components/sections/WhyChooseUs";
import AboutMini from "@/components/sections/AboutMini";
import CaseStudiesPreview from "@/components/sections/CaseStudiesPreview";
import Philosophy from "@/components/sections/Philosophy";
import Testimonials from "@/components/sections/Testimonials";
import FAQ from "@/components/sections/FAQ";
import FinalCTA from "@/components/sections/FinalCTA";
import TrustSignals from "@/components/sections/TrustSignals";
import JsonLd from "@/components/shared/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { faqPageSchema } from "@/lib/schema";
import { getFaqs } from "@/lib/faq";
import { getServices } from "@/lib/services";
import { getTestimonials } from "@/lib/testimonials";

export const metadata: Metadata = pageMetadata({
  title: "Ads by Shoaib — Performance Marketing by Shoaib Nabi Noor",
  description:
    "Independent performance marketing practice led by Shoaib Nabi Noor — turning strategy, targeting, and creative into leads, bookings, and sales across Meta, Google, YouTube, and TikTok.",
  path: "/",
  titleAbsolute: true,
});

export default async function Home() {
  const [faqs, services, testimonials] = await Promise.all([
    getFaqs(),
    getServices(),
    getTestimonials(),
  ]);

  return (
    <PageWrapper>
      <JsonLd data={faqPageSchema(faqs.map((f) => ({ question: f.q, answer: f.a })))} />
      <Hero />
      <PainPoints />
      <Turn />
      <ServicesOverview services={services} />
      <WhyChooseUs />
      <AboutMini />
      <CaseStudiesPreview />
      <Philosophy />
      <Testimonials testimonials={testimonials} />
      <FAQ faqs={faqs} />
      <FinalCTA />
      <TrustSignals />
    </PageWrapper>
  );
}
