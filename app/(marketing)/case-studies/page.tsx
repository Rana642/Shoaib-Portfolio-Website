import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { getAllCaseStudies } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Case Studies",
  description:
    "Real campaigns, real numbers — how Shoaib Nabi Noor's performance marketing practice turns ad spend into bookings, leads, and sales across eight industries.",
  path: "/case-studies",
});

export default async function CaseStudiesPage() {
  const caseStudies = await getAllCaseStudies();

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Case Studies", path: "/case-studies" },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Case Studies</Tag>
            <h1 className="font-serif italic text-hero mt-8 max-w-3xl">
              Proof beats promises<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-2xl">
              Every engagement below started with the same question — where is the money
              actually leaking? Here's what happened after we answered it.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-24 md:pb-32">
        <div className="container-wide grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {caseStudies.map((cs, i) => (
            <Reveal key={cs.slug} delay={(i % 3) * 0.08}>
              <Link
                href={`/case-studies/${cs.slug}`}
                className="group flex flex-col h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    {cs.industry}
                  </span>
                  <ArrowUpRight
                    className="size-5 text-ink-subtle transition-all duration-300 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </div>
                <h2 className="font-serif italic text-h3 mt-8">{cs.client}</h2>
                <p className="text-small text-ink-muted mt-3 flex-1">{cs.excerpt}</p>
                <p className="text-body font-medium mt-6 self-start">
                  <span className="bg-citrus/40 rounded-sm px-1 -mx-1 box-decoration-clone">
                    {cs.outcome}
                  </span>
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <FinalCTA />
    </PageWrapper>
  );
}
