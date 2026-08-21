"use client";

/*
 * DRAFT COPY — 7 questions in brand voice, pending Shoaib's final FAQ list.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import Reveal from "@/components/shared/Reveal";
import { cn } from "@/lib/utils";

const faqs = [
  {
    q: "What exactly do you do?",
    a: "I plan, launch, and manage paid advertising across Meta, Google, YouTube, and TikTok — plus the tracking and landing pages that make those ads measurable. One practice, full funnel.",
  },
  {
    q: "Are you an agency?",
    a: "No — this is an independent practice. You work directly with me, and I bring in a specialist network for design, video, or development when a project calls for it. No account managers in between.",
  },
  {
    q: "What budgets do you work with?",
    a: "Enough to learn and scale — typically from a few hundred dollars a month in ad spend upward. If your budget is too small to generate usable data, I'll tell you that in the first call instead of taking it.",
  },
  {
    q: "How do you charge?",
    a: "Monthly retainer for ongoing management, or a fixed project fee for defined builds like tracking setups and funnels. Both doors are open — we pick whichever fits your situation.",
  },
  {
    q: "How soon will I see results?",
    a: "Tracking and structure land in week one. Meaningful signal takes 2–6 weeks depending on budget and sales cycle. Anyone promising day-three profitability is selling you a screenshot.",
  },
  {
    q: "Do you also do design and video?",
    a: "Creative direction, yes — production runs through my specialist network. You get one accountable point of contact either way.",
  },
  {
    q: "How do we start?",
    a: "Book a free audit. I'll look at your account (or your plans), tell you what I'd fix first, and you decide whether we work together. No obligation either way.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-24 md:py-32">
      <div className="container-narrow">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            Questions
          </span>
          <h2 className="font-serif italic text-h2 mt-6">
            Asked before, answered honestly<span className="text-citrus">.</span>
          </h2>
        </Reveal>

        <div className="mt-14 divide-y divide-ink/10 border-y border-ink/10">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={i} delay={i * 0.04}>
                <div>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-6 py-6 text-left group"
                  >
                    <span className="text-body-lg font-medium">{faq.q}</span>
                    <span
                      className={cn(
                        "flex items-center justify-center size-9 rounded-full border border-ink/15 shrink-0 transition-all duration-300 group-hover:border-citrus group-hover:bg-citrus/20",
                        isOpen && "bg-citrus border-citrus rotate-45"
                      )}
                    >
                      <Plus className="size-4" aria-hidden />
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="text-body text-ink-muted pb-6 max-w-2xl">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
