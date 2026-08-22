"use client";

/*
 * Data comes from lib/testimonials.ts via the home page (Sanity-first,
 * placeholder fallback until Shoaib collects real client quotes).
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import Reveal from "@/components/shared/Reveal";
import type { Testimonial } from "@/lib/testimonials";

export default function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const prev = () => setIndex((i) => (i - 1 + testimonials.length) % testimonials.length);
  const next = () => setIndex((i) => (i + 1) % testimonials.length);

  return (
    <section className="py-24 md:py-32 bg-white/40 overflow-hidden">
      <div className="container-wide">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
              Client words
            </span>
            <h2 className="font-serif italic text-h2 mt-6">
              What working together feels like<span className="text-citrus">.</span>
            </h2>
          </div>
          <div className="flex gap-3">
            <button
              onClick={prev}
              aria-label="Previous testimonial"
              className="flex items-center justify-center size-11 rounded-lg border border-ink/15 hover:bg-citrus hover:border-citrus transition-all"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={next}
              aria-label="Next testimonial"
              className="flex items-center justify-center size-11 rounded-lg border border-ink/15 hover:bg-citrus hover:border-citrus transition-all"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </Reveal>

        {/* Desktop: all three visible; Mobile: one at a time */}
        <div className="hidden md:grid grid-cols-3 gap-6 mt-14">
          {testimonials.map((t, i) => (
            <Reveal key={t.headline} delay={i * 0.08}>
              <TestimonialCard t={t} />
            </Reveal>
          ))}
        </div>

        <div className="md:hidden mt-14 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <TestimonialCard t={testimonials[index]} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 flex flex-col">
      <Quote className="size-6 text-citrus fill-citrus" aria-hidden />
      <p className="text-body-lg font-semibold mt-5">{t.headline}</p>
      <blockquote className="text-body text-ink-muted mt-3 flex-1">"{t.quote}"</blockquote>
      <figcaption className="mt-6 pt-5 border-t border-ink/10">
        <p className="text-small font-medium">{t.author}</p>
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-1.5">
          {t.context}
        </p>
      </figcaption>
    </figure>
  );
}
