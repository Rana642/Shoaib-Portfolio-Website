/*
 * Solutions index — start from the problem, not the service. Each card
 * leads to a problem page in lib/solutions.ts; hotels get their own
 * industry page.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { solutions } from "@/lib/solutions";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Ad Problems I Fix: Leads, Conversions, Tracking",
  description:
    "Ads not working, leads that never buy, clicks with no conversions, tracking you can't trust. Pick your problem and see how I fix it.",
  path: "/solutions",
});

const cards = [
  ...solutions.map((s) => ({ href: `/solutions/${s.slug}`, tag: s.eyebrow, problem: s.problem })),
  { href: "/hotel-marketing", tag: "Hotel digital marketing", problem: "Hotel bookings go to OTAs, not to you." },
];

export default function SolutionsPage() {
  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Solutions", path: "/solutions" },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-wide">
          <Reveal>
            <Tag>Solutions</Tag>
            <h1 className="font-serif italic text-hero mt-8 max-w-3xl">
              Start with the problem<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-xl">
              You don&apos;t need a list of services. You need the thing that&apos;s broken fixed.
              Pick the one that sounds like you.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-14">
            {cards.map((card, i) => (
              <Reveal key={card.href} delay={i * 0.06}>
                <Link
                  href={card.href}
                  className="group block h-full bg-white/50 border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                      {card.tag}
                    </span>
                    <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink" aria-hidden />
                  </div>
                  <h2 className="font-serif italic text-h3 mt-8">{card.problem}</h2>
                  <p className="text-small font-medium mt-4 underline-offset-4 decoration-citrus decoration-2 group-hover:underline">
                    How I fix this
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <FinalCTA />
    </PageWrapper>
  );
}
