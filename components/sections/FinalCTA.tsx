/*
 * DRAFT COPY — final CTA, pending Shoaib's final copy files.
 */
import Button from "@/components/ui/Button";
import Reveal from "@/components/shared/Reveal";

export default function FinalCTA() {
  return (
    <section className="min-h-[70vh] flex items-center py-24 md:py-32 bg-ink text-cloud relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-32 right-0 size-[30rem] rounded-full bg-citrus/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-cobalt/15 blur-3xl"
      />
      <div className="container-narrow text-center relative">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-cloud/40">
            Your move
          </span>
          <h2 className="font-serif italic text-hero mt-8">
            Let's assemble yours<span className="text-citrus">.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-body-lg text-cloud/70 mt-6 max-w-xl mx-auto">
            One call. I'll look at what you're running, tell you what I'd fix first, and
            you'll leave with clarity either way — whether we work together or not.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <Button
              href="/contact"
              withArrow
              className="bg-citrus text-ink hover:shadow-citrus/25"
            >
              Get a free audit
            </Button>
            <Button
              href="/case-studies"
              withArrow
              className="bg-transparent text-cloud border border-cloud/25 hover:border-citrus hover:bg-citrus hover:text-ink"
            >
              See the results first
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
