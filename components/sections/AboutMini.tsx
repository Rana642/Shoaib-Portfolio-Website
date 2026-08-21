/*
 * DRAFT COPY — mini about, pending Shoaib's final copy files.
 */
import Image from "next/image";
import Button from "@/components/ui/Button";
import Reveal from "@/components/shared/Reveal";

export default function AboutMini() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-narrow grid grid-cols-1 md:grid-cols-5 gap-12 items-center">
        <Reveal className="md:col-span-2">
          <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl shadow-citrus/20 max-w-xs mx-auto md:max-w-none">
            <Image
              src="/images/shoaib.png"
              alt="Shoaib Nabi Noor"
              fill
              sizes="(max-width: 768px) 320px, 33vw"
              className="object-cover object-top"
            />
          </div>
        </Reveal>

        <div className="md:col-span-3">
          <Reveal>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              About
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              Hey, I'm Shoaib<span className="text-citrus">.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-body-lg text-ink-muted mt-6">
              I've spent the last six years inside ad accounts — planning, launching, and
              managing paid campaigns across Meta, Google, YouTube, and TikTok for brands
              in eight industries.
            </p>
            <p className="text-body text-ink-muted mt-4">
              Every account gets the same treatment: numbers first, opinions second —
              backed by a specialist network for design, video, and development when a
              build needs more hands.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-8">
              <Button href="/about" variant="secondary" withArrow>
                More about me
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
