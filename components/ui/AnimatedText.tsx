"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

type AnimatedTextProps = {
  text: string;
  /** "chars" reveals per character, "words" per word, "lines" fades whole block */
  split?: "chars" | "words" | "lines";
  as?: "h1" | "h2" | "h3" | "p" | "span";
  delay?: number;
  className?: string;
};

export default function AnimatedText({
  text,
  split = "words",
  as: Tag = "p",
  delay = 0,
  className,
}: AnimatedTextProps) {
  const ref = useRef<HTMLElement>(null);

  const words = useMemo(() => text.split(" "), [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets =
      split === "lines" ? el : el.querySelectorAll<HTMLElement>("[data-reveal]");

    const ctx = gsap.context(() => {
      gsap.from(targets, {
        yPercent: 60,
        opacity: 0,
        duration: 0.7,
        ease: "power3.out",
        delay,
        stagger: split === "chars" ? 0.018 : 0.05,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          once: true,
        },
      });
    }, el);

    return () => ctx.revert();
  }, [split, delay]);

  return (
    <Tag
      // @ts-expect-error -- polymorphic ref across heading/paragraph tags
      ref={ref}
      aria-label={text}
      className={cn(className)}
    >
      {split === "lines" ? (
        <span aria-hidden>{text}</span>
      ) : (
        words.map((word, wi) => (
          <span key={wi} aria-hidden className="inline-block overflow-hidden align-bottom">
            {split === "chars" ? (
              [...word].map((ch, ci) => (
                <span key={ci} data-reveal className="inline-block will-change-transform">
                  {ch}
                </span>
              ))
            ) : (
              <span data-reveal className="inline-block will-change-transform">
                {word}
              </span>
            )}
            {wi < words.length - 1 && <span className="inline-block">&nbsp;</span>}
          </span>
        ))
      )}
    </Tag>
  );
}
