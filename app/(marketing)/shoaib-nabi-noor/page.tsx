/*
 * DRAFT — experience entries marked [Placeholder] need Shoaib's real CV data
 * (employers, dates, education, certifications). The accountant background
 * appears HERE and only here, per Shoaib's instruction.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { Download, Mail, Phone, MapPin } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Shoaib Nabi Noor — Resume",
  description:
    "Resume of Shoaib Nabi Noor — performance marketing specialist. Six years in paid media, $2.5M+ managed across Meta, Google, YouTube, and TikTok.",
};

const experience = [
  {
    period: "2023 — Present",
    role: "Founder & Performance Marketing Specialist",
    org: "Ads by Shoaib — Independent Practice",
    points: [
      "Running paid media end-to-end for retainer and project clients across 8 industries",
      "$2.5M+ lifetime ad spend managed across Meta, Google, YouTube, and TikTok",
      "Built the practice's specialist network for design, video, and development",
    ],
  },
  {
    period: "2021 — 2023",
    role: "Media Buyer [Placeholder — confirm role & employer]",
    org: "[Agency / Company name]",
    points: [
      "[Placeholder] Managed Meta and Google accounts for local and international clients",
      "[Placeholder] Owned tracking setups: Pixel, Conversions API, GA4, Tag Manager",
    ],
  },
  {
    period: "2019 — 2021",
    role: "Digital Marketing Executive [Placeholder — confirm role & employer]",
    org: "[Company name]",
    points: [
      "[Placeholder] First years in paid media — campaign management and reporting",
    ],
  },
  {
    period: "Before 2019",
    role: "Accountant",
    org: "[Firm name — placeholder]",
    points: [
      "Managed ledgers, reconciliations, and reporting — the discipline of making numbers balance",
      "The habit that still runs the practice today: every marketing claim must reconcile with the P&L",
    ],
  },
];

const skills = [
  "Meta Ads (Facebook & Instagram)",
  "Google Ads — Search & PMax",
  "YouTube Ads",
  "TikTok Ads",
  "Meta Pixel & Conversions API",
  "GA4 & Google Tag Manager",
  "Funnel & landing page strategy",
  "Creative testing frameworks",
  "Budget & bid management",
  "Plain-English reporting",
];

const certifications = [
  "[Placeholder] Meta Certified Media Buying Professional",
  "[Placeholder] Google Ads Search Certification",
  "[Placeholder] Google Analytics 4 Certification",
];

export default function ResumePage() {
  return (
    <PageWrapper>
      {/* Header */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <div className="flex flex-col md:flex-row gap-10 md:items-end justify-between">
            <Reveal>
              <Tag>Resume</Tag>
              <h1 className="font-serif italic text-hero mt-8">
                Shoaib Nabi Noor<span className="text-citrus">.</span>
              </h1>
              <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
                Performance marketing specialist — six years turning ad budgets into
                measurable revenue across Meta, Google, YouTube, and TikTok.
              </p>
              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-8">
                <a
                  href="mailto:shoaib.nabi.noor@gmail.com"
                  className="flex items-center gap-2 text-small text-ink-muted hover:text-ink transition-colors"
                >
                  <Mail className="size-4 text-cobalt" aria-hidden />
                  shoaib.nabi.noor@gmail.com
                </a>
                <a
                  href="tel:+923017461642"
                  className="flex items-center gap-2 text-small text-ink-muted hover:text-ink transition-colors"
                >
                  <Phone className="size-4 text-cobalt" aria-hidden />
                  +92 301 7461642
                </a>
                <span className="flex items-center gap-2 text-small text-ink-muted">
                  <MapPin className="size-4 text-cobalt" aria-hidden />
                  Multan, Pakistan · Remote worldwide
                </span>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="relative size-40 md:size-48 rounded-2xl overflow-hidden shadow-xl shadow-citrus/20 shrink-0">
                <Image
                  src="/images/shoaib.png"
                  alt="Shoaib Nabi Noor"
                  fill
                  priority
                  sizes="192px"
                  className="object-cover object-top"
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Experience */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h2">
              Experience<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="mt-10 space-y-0">
            {experience.map((job, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 md:gap-10 py-8 border-b border-ink/10">
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle pt-1.5">
                    {job.period}
                  </span>
                  <div>
                    <h3 className="text-body-lg font-semibold">{job.role}</h3>
                    <p className="text-small text-cobalt font-medium mt-1">{job.org}</p>
                    <ul className="mt-4 space-y-2.5">
                      {job.points.map((point, pi) => (
                        <li key={pi} className="flex gap-3 items-start text-body text-ink-muted">
                          <span className="size-1.5 rounded-full bg-citrus inline-block shrink-0 mt-2.5" aria-hidden />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Skills + Certifications */}
      <section className="py-16 md:py-20">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-2 gap-12">
          <Reveal>
            <h2 className="font-serif italic text-h3">
              Skills & platforms<span className="text-citrus">.</span>
            </h2>
            <div className="flex flex-wrap gap-3 mt-8">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="text-small border border-ink/15 rounded-full px-4 py-2 hover:border-citrus hover:bg-citrus/10 transition-all"
                >
                  {skill}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="font-serif italic text-h3">
              Certifications<span className="text-citrus">.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {certifications.map((cert) => (
                <li key={cert} className="flex gap-3 items-start text-body text-ink-muted">
                  <span className="size-1.5 rounded-full bg-cobalt inline-block shrink-0 mt-2.5" aria-hidden />
                  {cert}
                </li>
              ))}
            </ul>
            <p className="text-small text-ink-subtle mt-6">
              Education details to be added.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Sticky download bar */}
      <div className="sticky bottom-6 z-40 pointer-events-none">
        <div className="container-narrow flex justify-end">
          {/* PDF pending — becomes a real file link once the CV PDF is provided */}
          <Button
            href="/contact"
            className="pointer-events-auto shadow-2xl shadow-ink/20"
            withArrow
          >
            <Download className="size-4" aria-hidden />
            Request PDF resume
          </Button>
        </div>
      </div>

      <section className="py-16 md:py-24">
        <div className="container-narrow text-center">
          <Reveal>
            <p className="text-body-lg text-ink-muted max-w-xl mx-auto">
              Open to the right roles, retainers, and projects — if the work involves
              making paid media measurable and profitable, let's talk.
            </p>
            <div className="mt-8">
              <Button href="/contact" variant="secondary" withArrow>
                Get in touch
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
    </PageWrapper>
  );
}
