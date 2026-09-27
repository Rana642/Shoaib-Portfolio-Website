/*
 * Google Business Profile management — service landing page. Targets
 * "google business profile management" (+ services / optimization / GMB
 * variants, Keyword Planner 2026-09-27). Hook (lost local searches) →
 * causes → what gets managed → process → CTA. No ranking promises: Google
 * decides local rankings; the page only claims the work itself.
 */
import type { Metadata } from "next";
import { BadgeCheck, Camera, ChartLine, MessageSquareText, Store } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import Process from "@/components/sections/Process";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Google Business Profile Management and Optimization Services",
  description:
    "Google Business Profile management for local businesses: setup, verification, GMB optimization, reviews, weekly posts, and tracking of calls and direction requests.",
  path: "/google-business-profile-management",
});

const problems = [
  "Your profile is incomplete, unverified, or still has old hours and photos.",
  "Competitors show up on Google Maps for your services. You don't.",
  "Reviews go unanswered, and new ones rarely come in.",
  "You can't tell how many calls and visits the profile actually brings.",
];

const work = [
  {
    icon: BadgeCheck,
    title: "Setup and verification",
    description: "A claimed, verified profile with the right name, address, phone, and hours everywhere.",
  },
  {
    icon: Store,
    title: "Profile optimization",
    description: "Categories, services, products, description, and attributes filled in properly, not left blank.",
  },
  {
    icon: MessageSquareText,
    title: "Reviews",
    description: "A simple way to ask happy customers for reviews, and a reply to every review, good or bad.",
  },
  {
    icon: Camera,
    title: "Posts and photos",
    description: "Regular updates, offers, and fresh photos, so the profile looks alive to searchers.",
  },
  {
    icon: ChartLine,
    title: "Tracking",
    description: "Calls, direction requests, and website clicks counted, so you see what the profile brings.",
  },
];

export default function GoogleBusinessProfilePage() {
  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Google Business Profile Management", path: "/google-business-profile-management" },
        ])}
      />

      {/* Hook */}
      <section className="py-14 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <Tag>Google Business Profile management</Tag>
            <h1 className="font-serif italic text-hero mt-6">
              Be the business people find on{" "}
              <span className="relative whitespace-nowrap">
                <span className="absolute inset-x-0 bottom-1 h-[38%] bg-citrus/60 -z-10 -rotate-1 rounded-sm" />
                Google Maps
              </span>
              <span className="text-cobalt">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-5 max-w-xl">
              Google Business Profile management and optimization for local businesses: a complete,
              active profile that turns local searches into calls, visits, and bookings.
            </p>
            <div className="flex flex-wrap gap-4 mt-8">
              <Button href="/contact" withArrow>
                Get a free audit
              </Button>
            </div>
            <p className="text-small text-ink-muted mt-4">
              30-minute call. No pitch. You leave with a fix list.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Problems */}
      <section className="py-14 md:py-20 border-t border-ink/10">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Sound familiar?
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Local customers search first. Then they call whoever they find.
            </h2>
          </Reveal>
          <ul className="mt-10 space-y-6">
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

      {/* What gets managed */}
      <section className="py-14 md:py-20 bg-citrus/10 border-y border-citrus/20">
        <div className="container-wide">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              What I manage
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Google Business Profile management services<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
              Everything a GMB manager should handle, done every week instead of once.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {work.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.06}>
                <div className="h-full bg-white/60 border border-ink/5 rounded-2xl p-7">
                  <item.icon className="size-7 text-cobalt" aria-hidden />
                  <h3 className="font-serif italic text-h3 mt-5">{item.title}</h3>
                  <p className="text-body text-ink-muted mt-2">{item.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10 max-w-2xl">
            <p className="text-small text-ink-muted">
              Honest note: Google decides local rankings. What I control is a complete, accurate, and
              active profile, which is what Google rewards.
            </p>
          </Reveal>
        </div>
      </section>

      <Process />
      <FinalCTA />
    </PageWrapper>
  );
}
