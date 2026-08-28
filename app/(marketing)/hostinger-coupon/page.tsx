import type { Metadata } from "next";
import Link from "next/link";
import { Check, Info } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import JsonLd from "@/components/shared/JsonLd";
import CouponCode from "@/components/shared/CouponCode";
import HostingerPartnerBadge from "@/components/shared/HostingerPartnerBadge";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema, faqPageSchema } from "@/lib/schema";
import { hostinger } from "@/lib/hostinger";

export const metadata: Metadata = pageMetadata({
  title: "Hostinger Coupon Code — 20% Off with NAWAL20",
  description:
    "Verified Hostinger Partner discount: use coupon code NAWAL20 for 20% off web, cloud, VPS, and agency hosting. Here's exactly how to apply it, and who each plan is for.",
  path: "/hostinger-coupon",
});

const included = [
  "Free domain name on annual plans and longer",
  "Free SSL certificate and a global CDN",
  "Free website migration from your current host",
  "Business email on the plans that bundle it",
  "24/7 support and a 30-day money-back guarantee",
  "One-click WordPress and an AI website builder",
];

const plans = [
  {
    name: "Web hosting",
    who: "A first website, portfolio, or small business site.",
    note: "Cheapest way to get online properly — free domain, email, and migration included.",
  },
  {
    name: "Cloud hosting",
    who: "Higher-traffic sites that outgrew shared hosting.",
    note: "Dedicated resources and daily backups for stores and busy blogs.",
  },
  {
    name: "VPS hosting",
    who: "Developers and demanding apps needing full control.",
    note: "AMD EPYC virtual servers you configure yourself.",
  },
  {
    name: "Agency / multi-site",
    who: "Freelancers and agencies hosting many client sites.",
    note: "Isolated environments and per-site access under one roof.",
  },
];

const steps = [
  {
    title: "Open Hostinger through my partner link",
    detail: "It carries the discount automatically, so the price already reflects the partner rate.",
  },
  {
    title: "Pick your plan and billing period",
    detail: "The longer the term, the better the per-month price — and the free domain kicks in on annual plans.",
  },
  {
    title: `Enter code ${hostinger.coupon} at checkout`,
    detail: "If a field for a coupon isn't already filled, paste the code in the “Have a coupon?” box before you pay.",
  },
  {
    title: "Confirm the 20% is applied, then check out",
    detail: "You'll see the discounted total on the payment screen. That's it — you're live.",
  },
];

const faqs = [
  {
    question: "What is the Hostinger coupon code?",
    answer:
      "The code is NAWAL20. It applies a 20% discount at checkout on new Hostinger plans. You can also use my partner link, which carries the discount automatically.",
  },
  {
    question: "How much do I save with the Hostinger coupon?",
    answer:
      "You save 20% on your new plan. The saving is largest on longer billing terms, where Hostinger's own base price is already lower — so the 20% comes off an already-discounted rate.",
  },
  {
    question: "Does the coupon work on all Hostinger plans?",
    answer:
      "It applies to new purchases across web hosting, cloud hosting, VPS, and agency plans. Renewals and some short one-month terms can be excluded — the checkout will show whether it applied before you pay.",
  },
  {
    question: "Is this an official Hostinger discount?",
    answer:
      "Yes. I'm a verified Hostinger Partner, and NAWAL20 is my official partner code. Using it costs you nothing extra — you get the discount, and it supports my independent practice at no cost to you.",
  },
  {
    question: "Do I need technical skills to set up hosting?",
    answer:
      "No. Hostinger includes one-click WordPress, an AI website builder, and free migration if you already have a site. If you'd rather not touch any of it, setting clients up is part of what I do.",
  },
];

export default function HostingerCouponPage() {
  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Hostinger Coupon", path: "/hostinger-coupon" },
        ])}
      />
      <JsonLd data={faqPageSchema(faqs)} />

      {/* Hero + coupon */}
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Verified Partner Deal</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              Hostinger coupon code: save 20%<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-2xl">
              I&apos;m a verified Hostinger Partner, so I can pass on an official{" "}
              <strong className="text-ink font-semibold">20% discount</strong> on new hosting. Use
              the code below at checkout, or open Hostinger through my link and it applies on its
              own.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-10 rounded-3xl border border-ink/10 bg-white/60 backdrop-blur-sm p-7 md:p-9 shadow-xl shadow-citrus/10">
              <div className="flex flex-col md:flex-row md:items-center gap-8 md:justify-between">
                <div>
                  <HostingerPartnerBadge width={176} />
                  <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-5 mb-3">
                    Your coupon code
                  </p>
                  <CouponCode />
                  <p className="text-small text-ink-subtle mt-3">
                    They save {hostinger.discount}. No extra cost to you.
                  </p>
                </div>
                <div className="md:text-right">
                  <p className="font-serif italic text-h2 leading-none">20% off</p>
                  <p className="text-small text-ink-muted mt-2 md:ml-auto max-w-[220px]">
                    On web, cloud, VPS &amp; agency hosting.
                  </p>
                  <div className="mt-6">
                    <Button href={hostinger.referralUrl} external withArrow>
                      Claim 20% off
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What you get */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              What&apos;s included
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              More than a cheap price<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
              The discount is the easy part. What makes Hostinger my default recommendation is what
              comes bundled in.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4 mt-10">
            {included.map((item, i) => (
              <Reveal key={item} delay={(i % 2) * 0.06}>
                <div className="flex items-start gap-3 py-2">
                  <Check className="size-5 text-citrus shrink-0 mt-0.5" aria-hidden />
                  <span className="text-body text-ink-muted">{item}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Which plan */}
      <section className="py-16 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Which plan
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Pick the right one<span className="text-citrus">.</span>
            </h2>
            <p className="text-body-lg text-ink-muted mt-4 max-w-xl">
              The code works on all of them. Here&apos;s the honest version of who each is actually
              for.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
            {plans.map((plan, i) => (
              <Reveal key={plan.name} delay={(i % 2) * 0.07}>
                <div className="h-full border border-ink/10 rounded-2xl p-7 hover:border-citrus/50 hover:bg-citrus/5 transition-all duration-300">
                  <h3 className="text-body-lg font-semibold">{plan.name}</h3>
                  <p className="text-small text-cobalt mt-2">{plan.who}</p>
                  <p className="text-small text-ink-muted mt-3">{plan.note}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How to use */}
      <section className="py-16 md:py-20 bg-white/40">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              How to use it
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Applying the code<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="mt-10 space-y-6">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.05}>
                <div className="flex gap-5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-cloud font-mono text-small">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-body-lg font-medium">{step.title}</p>
                    <p className="text-body text-ink-muted mt-1">{step.detail}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div className="mt-10">
              <Button href={hostinger.referralUrl} external withArrow>
                Get 20% off Hostinger
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Questions
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Hostinger coupon FAQ<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <div className="mt-10 divide-y divide-ink/10 border-t border-ink/10">
            {faqs.map((faq, i) => (
              <Reveal key={faq.question} delay={i * 0.04}>
                <div className="py-7">
                  <h3 className="text-body-lg font-semibold">{faq.question}</h3>
                  <p className="text-body text-ink-muted mt-3 max-w-2xl">{faq.answer}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Disclosure */}
      <section className="pb-20">
        <div className="container-narrow">
          <div className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white/40 p-5 max-w-2xl">
            <Info className="size-5 text-ink-subtle shrink-0 mt-0.5" aria-hidden />
            <p className="text-small text-ink-subtle">
              Disclosure: I&apos;m a verified Hostinger Partner. If you buy through my link or code, I
              may
              earn a commission — at no extra cost to you, and it never changes what I recommend. I
              suggest Hostinger because I use it for client work, not the other way around.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button href={hostinger.referralUrl} external withArrow>
              Claim your 20% off
            </Button>
            <Link
              href="/contact"
              className="text-small text-ink-muted hover:text-ink underline decoration-citrus decoration-2 underline-offset-4 transition-colors"
            >
              Or have me set it up for you
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
