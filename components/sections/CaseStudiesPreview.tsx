/*
 * Shows the three most recent case studies — Sanity-first via
 * lib/case-studies.ts, falling back to the placeholder MDX set.
 */
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/shared/Reveal";
import Button from "@/components/ui/Button";
import { getAllCaseStudies } from "@/lib/case-studies";

export default async function CaseStudiesPreview() {
  const caseStudies = (await getAllCaseStudies()).slice(0, 3);

  return (
    <section className="py-24 md:py-32 bg-white/40">
      <div className="container-wide">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Proof
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Results I'd put my name on<span className="text-citrus">.</span>
            </h2>
          </div>
          <Button href="/case-studies" variant="ghost" withArrow>
            All case studies
          </Button>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
          {caseStudies.map((cs, i) => (
            <Reveal key={cs.slug} delay={i * 0.08}>
              <Link
                href={`/case-studies/${cs.slug}`}
                className="group block h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
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
                <h3 className="font-serif italic text-h3 mt-10">{cs.client}</h3>
                <p className="text-body font-medium mt-3 relative inline-block">
                  <span className="absolute inset-x-0 bottom-0.5 h-[35%] bg-citrus/40 -z-0 rounded-sm" />
                  <span className="relative">{cs.outcome}</span>
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
