/*
 * Hotel digital marketing — the first industry landing page. Hook (OTA
 * dependence) → leap (what gets fixed) → hold (the hotel case studies and a
 * hospitality testimonial, pulled live from Sanity) → CTA.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Megaphone, MessageCircle, PanelsTopLeft, Radar } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import Process from "@/components/sections/Process";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { getAllCaseStudies } from "@/lib/case-studies";
import { getTestimonials } from "@/lib/testimonials";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Hotel Digital Marketing for Independent Hotels",
  description:
    "Hotel digital marketing that brings direct bookings: Meta and Google ads, WhatsApp booking campaigns, and booking-ready websites for independent hotels.",
  path: "/hotel-marketing",
});

const problems = [
  "Most bookings come through OTAs, and each one costs you commission.",
  "No website, or a website that can't take a booking.",
  "Ads bring likes and followers, not reservations.",
  "You can't tell which campaign filled which room.",
];

const fixes = [
  {
    icon: Megaphone,
    title: "Direct booking ads",
    description: "Meta and Google ads aimed at travellers ready to book, not just scroll.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp booking campaigns",
    description: "Ads that open a WhatsApp chat with your front desk, so guests book in minutes.",
  },
  {
    icon: PanelsTopLeft,
    title: "Booking-ready website",
    description: "A fast site with a booking system, so guests book with you, not a third party.",
  },
  {
    icon: Radar,
    title: "Tracking that counts bookings",
    description: "Every campaign measured by the bookings it brought, not the clicks.",
  },
];

// Hotel case studies, in the order they should be read.
const HOTEL_SLUGS = ["boutique-hotel-multan", "hotel-silver-sand", "hotel-avalon-suites"];

export default async function HotelMarketingPage() {
  const [allCaseStudies, testimonials] = await Promise.all([getAllCaseStudies(), getTestimonials()]);
  const hotelCases = HOTEL_SLUGS.map((slug) => allCaseStudies.find((cs) => cs.slug === slug)).filter(
    (cs): cs is NonNullable<typeof cs> => Boolean(cs)
  );
  const hotelQuote = testimonials.find((t) => /hospitality|hotel/i.test(`${t.context ?? ""} ${t.author}`));

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Hotel Digital Marketing", path: "/hotel-marketing" },
        ])}
      />

      {/* Hook */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Hotel digital marketing</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              More direct bookings.{" "}
              <span className="relative whitespace-nowrap">
                <span className="absolute inset-x-0 bottom-1 h-[38%] bg-citrus/60 -z-10 -rotate-1 rounded-sm" />
                Less OTA commission
              </span>
              <span className="text-cobalt">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-xl">
              I run digital marketing for independent hotels: ads, WhatsApp booking campaigns,
              and websites that take bookings directly.
            </p>
            <div className="flex flex-wrap gap-4 mt-10">
              <Button href="/contact" withArrow>
                Get a free audit
              </Button>
              <Button href="#hotel-results" variant="secondary" withArrow>
                See hotel results
              </Button>
            </div>
            <p className="text-small text-ink-muted mt-4">
              30-minute call. No pitch. You leave with a fix list.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Problems */}
      <section className="py-20 md:py-28 border-t border-ink/10">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Sound familiar?
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Full rooms shouldn&apos;t depend on someone else&apos;s website.
            </h2>
          </Reveal>
          <ul className="mt-12 space-y-6">
            {problems.map((problem, i) => (
              <Reveal key={problem} delay={i * 0.06}>
                <li className="flex gap-5 items-start border-b border-ink/10 pb-6">
                  <span className="font-serif italic text-h3 text-ink-subtle leading-none select-none">
                    0{i + 1}
                  </span>
                  <p className="text-body-lg">{problem}</p>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Hold: proof */}
      <section id="hotel-results" className="py-20 md:py-28 bg-citrus/10 border-y border-citrus/20 scroll-mt-24">
        <div className="container-wide">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Proof
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Hotels I&apos;ve worked with<span className="text-citrus">.</span>
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {hotelCases.map((cs, i) => (
              <Reveal key={cs.slug} delay={i * 0.08}>
                <Link
                  href={`/case-studies/${cs.slug}`}
                  className="group block h-full bg-white/60 border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                      {cs.industry}
                    </span>
                    <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink" aria-hidden />
                  </div>
                  <h3 className="font-serif italic text-h3 mt-8">{cs.client}</h3>
                  <p className="text-body font-medium mt-3">
                    <span className="bg-citrus/40 rounded-sm px-1 -mx-1 box-decoration-clone">
                      {cs.outcome}
                    </span>
                  </p>
                  <p className="text-small text-ink-muted mt-4">{cs.excerpt}</p>
                </Link>
              </Reveal>
            ))}
          </div>

          {hotelQuote && (
            <Reveal className="mt-12 max-w-2xl">
              <blockquote className="border-l-2 border-citrus pl-6">
                <p className="text-body-lg font-semibold">{hotelQuote.headline}</p>
                <p className="text-body-lg text-ink-muted mt-3">{hotelQuote.quote}</p>
                <footer className="text-small mt-4">
                  {hotelQuote.author}
                  {hotelQuote.context && (
                    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle ml-2">
                      {hotelQuote.context}
                    </span>
                  )}
                </footer>
              </blockquote>
            </Reveal>
          )}
        </div>
      </section>

      {/* Leap: what gets fixed */}
      <section className="py-20 md:py-28">
        <div className="container-wide">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              How I fix it
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Everything a hotel needs to sell rooms directly<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {fixes.map((fix, i) => (
              <Reveal key={fix.title} delay={i * 0.08}>
                <div className="h-full bg-white/50 border border-ink/5 rounded-2xl p-8">
                  <fix.icon className="size-8 text-cobalt" aria-hidden />
                  <h3 className="font-serif italic text-h3 mt-6">{fix.title}</h3>
                  <p className="text-body text-ink-muted mt-3">{fix.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Process />
      <FinalCTA />
    </PageWrapper>
  );
}
