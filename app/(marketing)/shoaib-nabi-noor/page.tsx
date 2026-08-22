/*
 * Real CV data (2026-08-22) — see lib/resume.ts and lib/experience.ts for
 * source and notes. Per Shoaib's explicit rule, adsbyshoaib.com is a
 * "Personal Branding context": Akhuwat Foundation (his pre-2019 accounting
 * job) and Moro Creatives are excluded here on purpose — see the
 * accountant-story-resume-only memory. Personal Information (father's
 * name, CNIC, marital status) from his CV data is also excluded from this
 * public page.
 */
import type { Metadata } from "next";
import Image from "next/image";
import { Download, Mail, Phone, MapPin } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import JsonLd from "@/components/shared/JsonLd";
import ExperienceAccordion from "@/components/sections/ExperienceAccordion";
import { LinkedinIcon, FacebookIcon, XIcon, InstagramIcon } from "@/components/ui/SocialIcons";
import { pageMetadata } from "@/lib/seo";
import { personSchema, breadcrumbSchema } from "@/lib/schema";
import {
  summary,
  keyMetrics,
  technicalSkillGroups,
  softSkillGroups,
  languages,
  education,
  certifications,
  socialProfiles,
} from "@/lib/resume";

export const metadata: Metadata = pageMetadata({
  title: "Shoaib Nabi Noor — Resume",
  description:
    "Resume of Shoaib Nabi Noor — performance marketing specialist. Six years in paid media, $2.5M+ managed across Meta, Google, YouTube, and TikTok.",
  path: "/shoaib-nabi-noor",
});

const socialIcons = { LinkedIn: LinkedinIcon, Facebook: FacebookIcon, "X (Twitter)": XIcon, Instagram: InstagramIcon };

export default function ResumePage() {
  return (
    <PageWrapper>
      <JsonLd data={personSchema()} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Resume", path: "/shoaib-nabi-noor" },
        ])}
      />
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
                Performance Marketing Specialist · Media Buyer — six years turning ad
                budgets into measurable revenue across Meta, Google, YouTube, and TikTok.
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
                  Multan, Punjab, Pakistan · Remote worldwide
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

      {/* Professional Summary */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h3">
              Summary<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-ink-muted mt-6 max-w-3xl">{summary}</p>
          </Reveal>
        </div>
      </section>

      {/* Key Career Metrics */}
      <section className="py-16 md:py-20">
        <div className="container-narrow">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-10">
            {keyMetrics.map((metric, i) => (
              <Reveal key={metric.label} delay={i * 0.05}>
                <p className="font-serif italic text-h2 leading-none">{metric.value}</p>
                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-3">
                  {metric.label}
                </p>
              </Reveal>
            ))}
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
            <p className="text-body text-ink-muted mt-3 max-w-xl">
              Three onsite roles built the foundation; Ads by Shoaib is the independent
              practice behind everything since — including the client work below. Click
              any entry for the full detail.
            </p>
          </Reveal>
          <ExperienceAccordion />
        </div>
      </section>

      {/* Technical Skills */}
      <section className="py-16 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h2">
              Core technical skills<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            {technicalSkillGroups.map((group, i) => (
              <Reveal key={group.category} delay={(i % 2) * 0.08}>
                <div className="h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-7">
                  <h3 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    {group.category}
                  </h3>
                  <div className="flex flex-wrap gap-2.5 mt-5">
                    {group.items.map((item) => (
                      <span
                        key={item}
                        className="text-small border border-ink/15 rounded-full px-3.5 py-1.5 hover:border-citrus hover:bg-citrus/10 transition-all"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Soft Skills */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h2">
              Soft skills<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
            {softSkillGroups.map((group, i) => (
              <Reveal key={group.category} delay={(i % 3) * 0.07}>
                <div className="h-full border-t-2 border-cobalt pt-5">
                  <h3 className="text-body-lg font-semibold">{group.category}</h3>
                  <ul className="mt-4 space-y-2">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2.5 items-start text-small text-ink-muted">
                        <span className="size-1 rounded-full bg-citrus inline-block shrink-0 mt-2" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Languages + Education */}
      <section className="py-16 md:py-20">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-2 gap-12">
          <Reveal>
            <h2 className="font-serif italic text-h3">
              Languages<span className="text-citrus">.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {languages.map((lang) => (
                <li key={lang.name} className="flex justify-between gap-6 pb-3 border-b border-ink/10">
                  <span className="text-body font-medium">{lang.name}</span>
                  <span className="text-small text-ink-subtle text-right">{lang.level}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="font-serif italic text-h3">
              Education<span className="text-citrus">.</span>
            </h2>
            <ul className="mt-8 space-y-5">
              {education.map((edu) => (
                <li key={edu.degree}>
                  <p className="text-body font-medium">{edu.degree}</p>
                  <p className="text-small text-cobalt mt-0.5">{edu.institution}</p>
                  <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-1.5">
                    {edu.period}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h3">
              Certifications<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="mt-8 space-y-6">
            {certifications.map((cert) => (
              <Reveal key={cert.title}>
                <div className="bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-7 max-w-2xl">
                  <p className="text-body-lg font-semibold">{cert.title}</p>
                  <p className="text-small text-ink-muted mt-2">{cert.issuer}</p>
                  <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-3">
                    {cert.detail}
                  </p>
                  <p className="text-small text-ink-subtle mt-3">{cert.note}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Social profiles + References */}
      <section className="py-16 md:py-20">
        <div className="container-narrow flex flex-col md:flex-row md:items-center justify-between gap-8">
          <Reveal>
            <h2 className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-4">
              Find me elsewhere
            </h2>
            <div className="flex flex-wrap gap-3">
              {socialProfiles.map((profile) => {
                const Icon = socialIcons[profile.label as keyof typeof socialIcons];
                return (
                  <a
                    key={profile.label}
                    href={profile.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-small border border-ink/15 rounded-full pl-3 pr-4 py-2 hover:border-citrus hover:bg-citrus/10 transition-all"
                  >
                    <Icon className="size-4" aria-hidden />
                    {profile.handle}
                  </a>
                );
              })}
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-small text-ink-subtle">References available upon request.</p>
          </Reveal>
        </div>
      </section>

      {/* Sticky download bar */}
      <div className="sticky bottom-6 z-40 pointer-events-none">
        <div className="container-narrow flex justify-end">
          <Button
            href="/documents/shoaib-nabi-noor-resume.pdf"
            download
            className="pointer-events-auto shadow-2xl shadow-ink/20"
          >
            <Download className="size-4" aria-hidden />
            Download PDF resume
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
