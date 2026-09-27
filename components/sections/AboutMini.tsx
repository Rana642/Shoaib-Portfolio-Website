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
          <div className="relative aspect-square max-w-xs mx-auto md:max-w-none">
            <div aria-hidden className="absolute inset-x-[6%] bottom-0 top-[12%] rounded-2xl bg-citrus/25" />
            <Image
              src="/images/shoaib-cutout.png"
              alt="Shoaib Nabi Noor"
              fill
              sizes="(max-width: 768px) 320px, 33vw"
              className="object-contain object-bottom drop-shadow-[0_14px_22px_rgba(15,15,20,0.2)]"
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
              I've spent 6+ years inside ad accounts for brands in 8 industries. Every account
              gets the same rule: numbers first, opinions second.
            </p>
            <blockquote className="font-serif italic text-h3 mt-8 border-l-2 border-citrus pl-5">
              I don't sell services. I sell outcomes I'd stake my name on.
            </blockquote>
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
