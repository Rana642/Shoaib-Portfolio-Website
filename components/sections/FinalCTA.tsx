/*
 * DRAFT COPY — final CTA, pending Shoaib's final copy files.
 */
import Image from "next/image";
import Button from "@/components/ui/Button";
import Reveal from "@/components/shared/Reveal";

export default function FinalCTA() {
  return (
    <section className="flex items-center py-20 md:py-28 bg-ink text-cloud relative overflow-hidden">
      <Image src="/visuals/cta-band.webp" alt="" fill sizes="100vw" className="object-cover object-right opacity-90" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink/80 via-ink/55 to-transparent" />
      <div
        aria-hidden
        className="absolute -top-32 right-0 size-[30rem] rounded-full bg-citrus/10 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-cobalt/15 blur-3xl"
      />
      {/* Portrait sits flush against the band's right and bottom edges; only its left and top edges fade, so no box is visible */}
      <div
        aria-hidden
        className="hidden lg:block absolute right-0 bottom-0 h-full aspect-[4/5] max-w-[46%]"
        style={{ maskImage: "linear-gradient(to right, transparent 0%, black 38%), linear-gradient(to bottom, transparent 0%, black 26%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 38%), linear-gradient(to bottom, transparent 0%, black 26%)", maskComposite: "intersect", WebkitMaskComposite: "source-in" }}
      >
        <Image src="/images/portraits/shoaib-casual-dark.webp" alt="" fill sizes="480px" className="object-cover object-top" />
      </div>
      <div className="container-wide relative grid grid-cols-1 lg:grid-cols-12 items-center gap-10">
      <div className="lg:col-span-7 text-center lg:text-left relative">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-cloud/60">
            Your move
          </span>
          <h2 className="font-serif italic text-hero mt-8">
            Let's find your leak<span className="text-citrus">.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-body-lg text-cloud/70 mt-6 max-w-xl mx-auto lg:mx-0">
            One call. I'll show you what I'd fix first, whether we work together or not.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-wrap justify-center lg:justify-start gap-4 mt-10">
            <Button
              href="/contact"
              withArrow
              className="bg-citrus text-ink hover:shadow-citrus/25"
            >
              Get a free audit
            </Button>
            <Button
              href="https://wa.me/923017461642"
              external
              rel="noopener noreferrer"
              withArrow
              className="bg-transparent text-cloud border border-cloud/25 hover:border-citrus hover:bg-citrus hover:text-ink"
            >
              Message on WhatsApp
            </Button>
          </div>
        </Reveal>
      </div>
      </div>
    </section>
  );
}
