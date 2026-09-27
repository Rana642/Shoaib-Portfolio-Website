/*
 * Setups index — single, fixed-scope setup services (like a gig menu), each
 * linking to its own page in lib/setups.ts.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Clock, Tag as TagIcon } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { setups } from "@/lib/setups";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Setup Services: Meta Pixel, Google Business Profile, Google Ads, GA4",
  description:
    "Single, fixed-price setup services: Meta Pixel and Conversions API, Google Business Profile, Google Ads account, Facebook page, Meta Business Suite, GA4, and more.",
  path: "/setups",
});

export default function SetupsPage() {
  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Setups", path: "/setups" },
        ])}
      />
      <section className="pt-8 pb-14 md:pt-12 md:pb-20">
        <div className="container-wide">
          <Reveal>
            <Tag>Setup services</Tag>
            <h1 className="font-serif italic text-hero mt-5 max-w-3xl">
              Just need one thing set up<span className="text-citrus">?</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
              Single setups with a fixed scope and a fixed price. Done properly by the person who
              runs the ads, so it works when you do.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
            {setups.map((s, i) => (
              <Reveal key={s.slug} delay={i * 0.04}>
                <Link
                  href={`/setups/${s.slug}`}
                  className="group flex h-full flex-col bg-white/50 border border-ink/5 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-sans font-semibold text-lg leading-snug tracking-tight">{s.name}</h2>
                    <ArrowUpRight className="size-5 shrink-0 text-ink-subtle group-hover:text-ink" aria-hidden />
                  </div>
                  <p className="text-small text-ink-muted mt-3 flex-1">{s.summary}</p>
                  <div className="mt-5 pt-4 border-t border-ink/10 space-y-1.5 text-small">
                    <p className="flex items-center gap-2">
                      <TagIcon className="size-3.5 text-cobalt" aria-hidden />
                      {s.price ?? "Fixed price"}
                    </p>
                    <p className="flex items-center gap-2 text-ink-muted">
                      <Clock className="size-3.5 text-cobalt" aria-hidden />
                      {s.delivery ?? "Timeline on request"}
                    </p>
                  </div>
                  <span className="mt-5 text-small font-medium underline-offset-4 decoration-citrus decoration-2 group-hover:underline">
                    See what&apos;s included
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10">
            <p className="text-small text-ink-muted max-w-2xl">
              Every price is fixed and confirmed before work starts. No payment until you&apos;ve seen it. Need several setups, or ongoing management?{" "}
              <Link href="/contact" className="font-medium text-ink underline decoration-citrus decoration-2 underline-offset-4">
                Get a free audit
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </section>
      <FinalCTA />
    </PageWrapper>
  );
}
