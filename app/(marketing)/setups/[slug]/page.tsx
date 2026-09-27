/*
 * One fixed-scope setup: what's included, what I need from you, price and
 * timeline, the order form beside it, then proof and FAQ. Content lives in
 * lib/setups.ts.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock, Info, Tag as TagIcon } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import SetupOrderForm from "@/components/forms/SetupOrderForm";
import { setups, getSetup, priceLabel, deliveryLabel } from "@/lib/setups";
import { getAllCaseStudies } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export function generateStaticParams() {
  return setups.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/setups/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const setup = getSetup(slug);
  if (!setup) return {};
  return pageMetadata({ title: setup.title, description: setup.description, path: `/setups/${setup.slug}` });
}

const faqs = [
  {
    q: "Is the price fixed?",
    a: "Yes. You get one fixed price and a timeline before any work starts. No hourly billing, no surprises.",
  },
  {
    q: "Do you need my passwords?",
    a: "No. I ask for admin or partner access through each platform's own sharing settings. Your logins stay yours.",
  },
  {
    q: "What happens after the setup?",
    a: "You own everything I set up. If you want it run and improved every week, I also offer monthly management, and the free audit is always open.",
  },
];

export default async function SetupPage({ params }: PageProps<"/setups/[slug]">) {
  const { slug } = await params;
  const setup = getSetup(slug);
  if (!setup) notFound();

  const allCaseStudies = await getAllCaseStudies();
  const proof = setup.caseStudySlugs
    .map((s) => allCaseStudies.find((cs) => cs.slug === s))
    .filter((cs): cs is NonNullable<typeof cs> => Boolean(cs));
  const others = setups.filter((s) => s.slug !== setup.slug);

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Setups", path: "/setups" },
          { name: setup.name, path: `/setups/${setup.slug}` },
        ])}
      />

      <section className="pt-8 pb-14 md:pt-12 md:pb-20">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* What you get */}
          <div className="lg:col-span-7">
            <Reveal>
              <Link
                href="/setups"
                className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
              >
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
                All setups
              </Link>
              <div>
                <Tag>{setup.eyebrow}</Tag>
              </div>
              <h1 className="font-serif italic text-hero mt-5">{setup.h1}</h1>
              <p className="text-body-lg text-ink-muted mt-4 max-w-2xl">{setup.intro}</p>

              <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
                <div className="flex items-center gap-2">
                  <TagIcon className="size-4 text-cobalt" aria-hidden />
                  <dt className="sr-only">Price</dt>
                  <dd className="text-body font-medium">{priceLabel(setup)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-cobalt" aria-hidden />
                  <dt className="sr-only">Delivery</dt>
                  <dd className="text-body font-medium">{deliveryLabel(setup)}</dd>
                </div>
              </dl>
            </Reveal>

            <Reveal className="mt-10">
              <h2 className="font-sans font-semibold text-xl md:text-2xl tracking-tight">What&apos;s included</h2>
              <ul className="mt-5 space-y-3">
                {setup.includes.map((item) => (
                  <li key={item} className="flex gap-3 items-start">
                    <Check className="size-5 text-cobalt shrink-0 mt-0.5" aria-hidden />
                    <span className="text-body">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="mt-10">
              <h2 className="font-sans font-semibold text-xl md:text-2xl tracking-tight">What I need from you</h2>
              <ul className="mt-5 space-y-3">
                {setup.needFromYou.map((item) => (
                  <li key={item} className="flex gap-3 items-start">
                    <span className="size-1.5 rounded-full bg-citrus inline-block shrink-0 mt-2.5" aria-hidden />
                    <span className="text-body">{item}</span>
                  </li>
                ))}
              </ul>
              {setup.platformNote && (
                <p className="mt-6 flex gap-3 items-start text-small text-ink-muted max-w-xl">
                  <Info className="size-4 text-cobalt shrink-0 mt-0.5" aria-hidden />
                  {setup.platformNote}
                </p>
              )}
            </Reveal>
          </div>

          {/* Order */}
          <div className="lg:col-span-5 lg:sticky lg:top-28">
            <div className="bg-white/60 border border-ink/5 rounded-2xl p-7 md:p-8 shadow-xl shadow-ink/5">
              <h2 className="font-serif italic text-h3">
                Order this setup<span className="text-citrus">.</span>
              </h2>
              <p className="text-small text-ink-muted mt-2 mb-6">{setup.name}</p>
              <SetupOrderForm setupName={setup.name} />
              <p className="text-small text-ink-muted mt-5 pt-5 border-t border-ink/10">
                Prefer to chat?{" "}
                <a
                  href={`https://wa.me/923017461642?text=${encodeURIComponent(`Hi Shoaib, I'd like the ${setup.name}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink underline decoration-citrus decoration-2 underline-offset-4"
                >
                  Message on WhatsApp
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {proof.length > 0 && (
        <section className="py-14 md:py-20 bg-citrus/10 border-y border-citrus/20">
          <div className="container-wide">
            <Reveal>
              <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">Proof</span>
              <h2 className="font-serif italic text-h2 mt-6">
                Done before<span className="text-citrus">.</span>
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
              {proof.map((cs) => (
                <Reveal key={cs.slug}>
                  <Link
                    href={`/case-studies/${cs.slug}`}
                    className="group block h-full bg-white/60 border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">{cs.industry}</span>
                      <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink" aria-hidden />
                    </div>
                    <h3 className="font-sans font-semibold text-xl md:text-2xl leading-snug tracking-tight mt-8">{cs.client}</h3>
                    <p className="text-body font-medium mt-3">
                      <span className="bg-citrus/40 rounded-sm px-1 -mx-1 box-decoration-clone">{cs.outcome}</span>
                    </p>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ + next step */}
      <section className="py-14 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <h2 className="font-serif italic text-h2">
              Before you order<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <dl className="mt-10 divide-y divide-ink/10 border-y border-ink/10">
            {faqs.map((f) => (
              <div key={f.q} className="py-6">
                <dt className="text-body-lg font-semibold">{f.q}</dt>
                <dd className="text-body text-ink-muted mt-2">{f.a}</dd>
              </div>
            ))}
          </dl>
          <p className="text-body mt-8">
            Want it run after setup?{" "}
            <Link
              href={setup.related.href}
              className="font-medium underline decoration-citrus decoration-2 underline-offset-4"
            >
              {setup.related.label}
            </Link>
          </p>
        </div>
      </section>

      <section className="pb-14 md:pb-20">
        <div className="container-wide">
          <h2 className="font-mono uppercase text-tag tracking-widest text-ink-muted">Other setups</h2>
          <ul className="mt-6 flex flex-wrap gap-3">
            {others.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/setups/${s.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-small hover:border-ink/30 hover:bg-ink/5 transition-colors"
                >
                  {s.name}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FinalCTA />
    </PageWrapper>
  );
}
