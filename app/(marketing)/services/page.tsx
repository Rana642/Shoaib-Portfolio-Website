/*
 * DRAFT COPY — pending Shoaib's final copy files.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { services } from "@/lib/services";
import { pageMetadata } from "@/lib/seo";
import { serviceSchema, breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Services",
  description:
    "Meta Ads, Google & YouTube Ads, tracking & analytics, and funnels — one connected performance marketing engine, managed by Shoaib Nabi Noor.",
  path: "/services",
});

const dontDo = [
  {
    title: "In-house design and video production",
    note: "Creative direction is mine; production runs through my specialist network. You still get one accountable point of contact.",
  },
  {
    title: "SEO retainers",
    note: "I build for paid performance. If organic is your priority, I'll say so in the audit — and point you to someone who lives there.",
  },
  {
    title: "Overnight-results promises",
    note: "Meaningful signal takes 2–6 weeks depending on budget and sales cycle. Anyone promising faster is selling screenshots.",
  },
  {
    title: "Dashboards instead of decisions",
    note: "You won't get a monthly screenshot and silence. Managed, not just monitored — that's the whole point.",
  },
];

const process = [
  {
    step: "Audit",
    detail: "I go through your account, tracking, and funnel — and tell you what I'd fix first, free.",
  },
  {
    step: "Plan",
    detail: "A written strategy: budgets, structure, creative angles, and what success will be measured by.",
  },
  {
    step: "Build",
    detail: "Tracking wired, campaigns structured, pages ready — before real money moves.",
  },
  {
    step: "Launch",
    detail: "Controlled spend while the data settles. No hero budgets on day one.",
  },
  {
    step: "Manage",
    detail: "Weekly decisions, documented. Monthly reports in plain English. Repeat.",
  },
];

export default function ServicesPage() {
  return (
    <PageWrapper>
      {services.map((service) => (
        <JsonLd key={service.slug} data={serviceSchema(service)} />
      ))}
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
        ])}
      />
      {/* Intro */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Services</Tag>
            <h1 className="font-serif italic text-hero mt-8 max-w-3xl">
              Four pillars. One engine<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-2xl">
              Ads, intent, measurement, and conversion — each one works alone, but the
              results you actually want come from running them as one connected system.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Service breakdowns */}
      {services.map((service, i) => (
        <section
          key={service.slug}
          className={i % 2 === 1 ? "py-20 md:py-28 bg-white/40" : "py-20 md:py-28"}
        >
          <div className="container-wide grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            <Reveal>
              <span className="font-serif italic text-hero text-ink-faint leading-none select-none">
                0{i + 1}
              </span>
              <h2 className="font-serif italic text-h2 mt-4">{service.title}</h2>
              <p className="text-body-lg font-medium mt-3 relative inline-block">
                <span className="absolute inset-x-0 bottom-0.5 h-[35%] bg-citrus/40 -z-0 rounded-sm" />
                <span className="relative">{service.tagline}</span>
              </p>
              {service.description.map((para, pi) => (
                <p key={pi} className="text-body text-ink-muted mt-4 max-w-xl">
                  {para}
                </p>
              ))}
              <div className="mt-8">
                <Button href={`/services/${service.slug}`} variant="secondary" withArrow>
                  Full breakdown
                </Button>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 h-full">
                <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                  What you get
                </h3>
                <ul className="mt-6 space-y-4">
                  {service.deliverables.map((item) => (
                    <li key={item} className="flex gap-3 items-start">
                      <Check className="size-5 text-cobalt shrink-0 mt-0.5" aria-hidden />
                      <span className="text-body">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      {/* What I don't do */}
      <section className="py-20 md:py-28 bg-ink text-cloud">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-cloud/40">
              Honest scope
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              What I don't do<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-cloud/70 mt-4 max-w-xl">
              Saying no to the wrong work is how the right work stays good.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {dontDo.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06}>
                <div className="border border-cloud/10 rounded-2xl p-7 h-full">
                  <div className="flex gap-3 items-start">
                    <X className="size-5 text-citrus shrink-0 mt-1" aria-hidden />
                    <div>
                      <h3 className="text-body-lg font-semibold">{item.title}</h3>
                      <p className="text-small text-cloud/60 mt-2">{item.note}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              How it works
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Five steps, no mystery<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <ol className="mt-12 space-y-0">
            {process.map((p, i) => (
              <Reveal key={p.step} delay={i * 0.06}>
                <li className="grid grid-cols-[auto_1fr] gap-6 py-7 border-b border-ink/10">
                  <span className="font-serif italic text-h3 text-cobalt leading-none w-10">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-body-lg font-semibold">{p.step}</h3>
                    <p className="text-body text-ink-muted mt-1.5 max-w-xl">{p.detail}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={0.2}>
            <div className="mt-12">
              <Link
                href="/contact"
                className="group inline-flex items-center gap-2 text-body-lg font-medium underline-offset-4 decoration-citrus decoration-2 hover:underline"
              >
                Start with the free audit
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <FinalCTA />
    </PageWrapper>
  );
}
