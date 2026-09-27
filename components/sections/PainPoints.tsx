/*
 * DRAFT COPY — written in brand voice pending Shoaib's final copy files.
 * Framework: PAS (Problem → Agitate), reader language, pain-first.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AnimatedText from "@/components/ui/AnimatedText";
import Reveal from "@/components/shared/Reveal";

const pains = [
  { text: "Ads run. Leads don't come.", href: "/services/meta-ads" },
  { text: "Leads come. None of them buy.", href: "/services/funnels-web" },
  { text: "You can't tell which ad actually works.", href: "/services/tracking-analytics" },
  {
    text: "Bookings go to OTAs, and you pay commission on every one.",
    href: "/case-studies/boutique-hotel-multan",
  },
];

export default function PainPoints() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-narrow">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Sound familiar?
          </span>
        </Reveal>
        <AnimatedText
          as="h2"
          split="words"
          text="Spending on ads but not seeing sales?"
          className="font-serif italic text-h2 mt-6 max-w-2xl"
        />
        <ul className="mt-14 space-y-8">
          {pains.map((pain, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <li className="flex flex-wrap gap-x-5 gap-y-2 items-start border-b border-ink/10 pb-8">
                <span className="font-serif italic text-h3 text-ink-subtle leading-none select-none">
                  0{i + 1}
                </span>
                <p className="text-body-lg text-ink flex-1 min-w-[14rem]">{pain.text}</p>
                <Link
                  href={pain.href}
                  className="group/link inline-flex items-center gap-1.5 text-small font-medium underline-offset-4 decoration-citrus decoration-2 hover:underline"
                >
                  How I fix this
                  <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-1" aria-hidden />
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
        <Reveal delay={0.2}>
          <p className="text-body-lg mt-12 max-w-xl">
            If one of these is you, you don't need more ads. You need the leak found.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
