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

export default function Home() {
  return (
    <PageWrapper>
      <Hero />
      <PainPoints />
      <Turn />
      <ServicesOverview />
      <WhyChooseUs />
      <AboutMini />
      <CaseStudiesPreview />
      <Philosophy />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <TrustSignals />
    </PageWrapper>
  );
}
