/*
 * DRAFT COPY — pending Shoaib's final copy files.
 * NOTE: accountant background is Resume-only by Shoaib's instruction — never here.
 */
import type { Metadata } from "next";
import Image from "next/image";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import Philosophy from "@/components/sections/Philosophy";
import FinalCTA from "@/components/sections/FinalCTA";

export const metadata: Metadata = {
  title: "About",
  description:
    "Shoaib Nabi Noor runs an independent performance marketing practice — six years in paid media across Meta, Google, YouTube, and TikTok, eight industries deep.",
};

const opinions = [
  {
    take: "Boosted posts are a donation to Meta.",
    why: "The boost button skips every structural decision that makes ads profitable. Convenient, yes. A strategy, no.",
  },
  {
    take: "If your tracking is broken, your opinions about ads are fiction.",
    why: "I've audited accounts where the 'losing' campaign was quietly producing half the revenue. The data was wrong, so every decision after it was too.",
  },
  {
    take: "Creative is the new targeting.",
    why: "The algorithm finds your buyer faster than your interest stack does — but only when the creative gives it a clear signal to work with.",
  },
  {
    take: "Cheap clicks are the most expensive thing you can buy.",
    why: "Cost per click is a vanity number. Cost per outcome is the only line I manage to.",
  },
  {
    take: "A dashboard is not a deliverable.",
    why: "Numbers without a decision attached are decoration. Every report I send ends with what changes next week — and why.",
  },
];

const industries = [
  "Hospitality",
  "Real Estate",
  "E-commerce & Fashion",
  "Pharma & Healthcare",
  "Legal Services",
  "Education",
  "Home & Local Services",
  "B2B",
];

const practicalBits = [
  {
    label: "Where",
    detail: "Based in Multan, Pakistan — working with clients locally and internationally, fully remote.",
  },
  {
    label: "How I work",
    detail: "Direct. You talk to me, not an account manager. Weekly decisions, monthly plain-English reports.",
  },
  {
    label: "Engagements",
    detail: "Monthly retainers for ongoing management, fixed-fee projects for defined builds. Jobs, retainers, projects — all doors open.",
  },
  {
    label: "The network",
    detail: "Design, video, and development run through a specialist network I direct — one accountable point of contact throughout.",
  },
];

export default function AboutPage() {
  return (
    <PageWrapper>
      {/* 1 — Intro */}
      <section className="py-20 md:py-28">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
          <div className="lg:col-span-3">
            <Reveal>
              <Tag>About</Tag>
              <h1 className="font-serif italic text-hero mt-8">
                The person behind the practice<span className="text-citrus">.</span>
              </h1>
              <p className="text-body-lg text-ink-muted mt-6 max-w-xl">
                I'm <strong className="text-ink font-semibold">Shoaib Nabi Noor</strong> —
                six years in paid media, eight industries, and one operating rule: spend
                behaves like an investment or it doesn't get spent.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.15} className="lg:col-span-2">
            <div className="relative aspect-[4/5] max-w-sm mx-auto lg:max-w-none rounded-2xl overflow-hidden shadow-2xl shadow-citrus/25">
              <Image
                src="/images/shoaib.png"
                alt="Shoaib Nabi Noor"
                fill
                priority
                sizes="(max-width: 1024px) 384px, 40vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* 2 — The story */}
      <section className="py-20 md:py-28 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              The story
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Why an independent practice<span className="text-citrus">?</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-8 max-w-2xl space-y-5 text-body-lg text-ink-muted">
              <p>
                I spent years watching good businesses get bad marketing. Agencies where
                the person selling the work never touched the account. Reports designed to
                be impressive instead of useful. Budgets treated like subscriptions instead
                of investments.
              </p>
              <p>
                Ads by Shoaib is the opposite bet: one specialist, directly accountable,
                running your strategy, your media, and your measurement as a single
                connected system. When a build needs more hands — design, video,
                development — my specialist network delivers it, and I stay accountable
                for the result.
              </p>
              <p>
                Six years, $2.5M+ in managed spend, and eight industries later, the bet
                keeps paying off — for the clients first.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 3 — Philosophy */}
      <Philosophy />

      {/* 4 — Opinions */}
      <section className="py-20 md:py-28 bg-ink text-cloud">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-cloud/40">
              Strong opinions, held accountable
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Things I'll say out loud<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="mt-12 space-y-0 divide-y divide-cloud/10">
            {opinions.map((op, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div className="py-7 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-10">
                  <h3 className="font-serif italic text-h3">{op.take}</h3>
                  <p className="text-body text-cloud/60 self-center">{op.why}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Industries */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Where I've spent
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Eight industries deep<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
              Different markets, same discipline — learn the unit economics first, then buy
              attention profitably.
            </p>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
            {industries.map((industry, i) => (
              <Reveal key={industry} delay={i * 0.04}>
                <div className="border border-ink/10 rounded-2xl p-6 h-full hover:border-citrus/50 hover:bg-citrus/5 transition-all duration-300">
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    0{i + 1}
                  </span>
                  <p className="text-body font-medium mt-3">{industry}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6 — Practical bits */}
      <section className="py-20 md:py-28 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              The practical bits
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              How working together actually works<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {practicalBits.map((bit, i) => (
              <Reveal key={bit.label} delay={i * 0.06}>
                <div className="border-t-2 border-citrus pt-6 h-full">
                  <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    {bit.label}
                  </h3>
                  <p className="text-body text-ink-muted mt-3">{bit.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <div className="mt-12 flex flex-wrap gap-4">
              <Button href="/shoaib-nabi-noor" variant="secondary" withArrow>
                See the full resume
              </Button>
              <Button href="/contact" withArrow>
                Get a free audit
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 7 — CTA */}
      <FinalCTA />
    </PageWrapper>
  );
}
