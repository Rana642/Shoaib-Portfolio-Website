"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AnimatedText from "@/components/ui/AnimatedText";

gsap.registerPlugin(ScrollTrigger);

export default function Philosophy() {
  const lineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = lineRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 1.2,
          ease: "power3.inOut",
          scrollTrigger: { trigger: el, start: "top 80%", once: true },
        }
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section className="min-h-[80vh] flex items-center py-24 md:py-32">
      <div className="container-narrow text-center">
        <AnimatedText
          as="h2"
          split="words"
          text="I don't sell services. I sell outcomes I'd stake my name on."
          className="font-serif italic text-h2 max-w-3xl mx-auto leading-snug"
        />
        {/* Citrus line draws itself on scroll into view */}
        <div
          ref={lineRef}
          aria-hidden
          className="h-0.5 w-40 bg-citrus mx-auto mt-10 origin-left"
        />
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-8">
          — Shoaib Nabi Noor
        </p>
      </div>
    </section>
  );
}
