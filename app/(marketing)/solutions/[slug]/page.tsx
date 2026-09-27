/*
 * One problem-first solution page: hook (the problem, in the searcher's
 * words) → why it happens → how I fix it → proof (only real, matching case
 * studies) → process → CTA. Content lives in lib/solutions.ts.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import Process from "@/components/sections/Process";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { solutions, getSolution } from "@/lib/solutions";
import { getAllCaseStudies } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export function generateStaticParams() {
  return solutions.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/solutions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const solution = getSolution(slug);
  if (!solution) return {};
  return pageMetadata({
    title: solution.title,
    description: solution.description,
    path: `/solutions/${solution.slug}`,
  });
}

export default async function SolutionPage({ params }: PageProps<"/solutions/[slug]">) {
  const { slug } = await params;
  const solution = getSolution(slug);
  if (!solution) notFound();

  const allCaseStudies = await getAllCaseStudies();
  const proof = solution.caseStudySlugs
    .map((s) => allCaseStudies.find((cs) => cs.slug === s))
    .filter((cs): cs is NonNullable<typeof cs> => Boolean(cs));
  const others = solutions.filter((s) => s.slug !== solution.slug);

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Solutions", path: "/solutions" },
          { name: solution.eyebrow, path: `/solutions/${solution.slug}` },
        ])}
      />

      {/* Hook */}
      <section className="pt-8 pb-14 md:pt-12 md:pb-20">
        <div className="container-narrow">
          <Reveal>
            <Link
              href="/solutions"
              className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
              All solutions
            </Link>
            <div>
              <Tag>{solution.eyebrow}</Tag>
            </div>
            <h1 className="font-serif italic text-hero mt-5">{solution.h1}</h1>
            <p className="text-body-lg text-ink-muted mt-4 max-w-2xl">{solution.intro}</p>
            <div className="flex flex-wrap gap-4 mt-7">
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

      {/* Why it happens */}
      <section className="py-14 md:py-20 border-t border-ink/10">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
              Why it happens
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              The usual causes<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <ul className="mt-12 space-y-6">
            {solution.causes.map((cause, i) => (
              <Reveal key={cause.title} delay={i * 0.06}>
                <li className="flex gap-5 items-start border-b border-ink/10 pb-6">
                  <span className="font-serif italic text-h3 text-ink-subtle leading-none select-none">
                    0{i + 1}
                  </span>
                  <div>
                    <h3 className="text-body-lg font-semibold">{cause.title}</h3>
                    <p className="text-body text-ink-muted mt-1">{cause.description}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* How I fix it */}
      <section className="py-14 md:py-20 bg-citrus/10 border-y border-citrus/20">
        <div className="container-wide">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
              How I fix it
            </span>
            <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
              Find the leak, then fix it in order<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            {solution.fixes.map((fix, i) => (
              <Reveal key={fix.title} delay={i * 0.06}>
                <li className="h-full bg-white/60 border border-ink/5 rounded-2xl p-6">
                  <span className="font-serif italic text-h2 leading-none select-none">{i + 1}</span>
                  <h3 className="text-body-lg font-semibold mt-4">{fix.title}</h3>
                  <p className="text-body text-ink-muted mt-2">{fix.description}</p>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-small text-ink-muted">Services involved:</span>
            {solution.services.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group/link inline-flex items-center gap-1.5 text-small font-medium underline-offset-4 decoration-citrus decoration-2 hover:underline"
              >
                {s.label}
                <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-1" aria-hidden />
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Proof — only when a real case study fits */}
      {proof.length > 0 && (
        <section className="py-14 md:py-20">
          <div className="container-wide">
            <Reveal className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
                  Proof
                </span>
                <h2 className="font-serif italic text-h2 mt-6">
                  Where I&apos;ve fixed this before<span className="text-citrus">.</span>
                </h2>
              </div>
              <Button href="/case-studies" variant="ghost" withArrow>
                All case studies
              </Button>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
              {proof.map((cs, i) => (
                <Reveal key={cs.slug} delay={i * 0.08}>
                  <Link
                    href={`/case-studies/${cs.slug}`}
                    className="group block h-full bg-white/50 border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
                        {cs.industry}
                      </span>
                      <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink" aria-hidden />
                    </div>
                    <h3 className="font-sans font-semibold text-xl md:text-2xl leading-snug tracking-tight mt-8">{cs.client}</h3>
                    <p className="text-body font-medium mt-3">
                      <span className="bg-citrus/40 rounded-sm px-1 -mx-1 box-decoration-clone">
                        {cs.outcome}
                      </span>
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <Process />

      {/* Other problems */}
      <section className="pb-14 md:pb-20">
        <div className="container-wide">
          <Reveal>
            <h2 className="font-mono uppercase text-tag tracking-widest text-ink-muted">
              Other problems I fix
            </h2>
          </Reveal>
          <ul className="mt-6 flex flex-wrap gap-3">
            {others.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/solutions/${s.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-small hover:border-ink/30 hover:bg-ink/5 transition-colors"
                >
                  {s.problem}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/hotel-marketing"
                className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-small hover:border-ink/30 hover:bg-ink/5 transition-colors"
              >
                Hotel bookings go to OTAs.
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <FinalCTA />
    </PageWrapper>
  );
}
