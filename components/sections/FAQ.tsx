"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import Reveal from "@/components/shared/Reveal";
import { cn } from "@/lib/utils";
import type { Faq } from "@/lib/faq";

export default function FAQ({ faqs }: { faqs: Faq[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-16 md:py-24">
      <div className="container-wide grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
        <Reveal className="lg:col-span-4 lg:sticky lg:top-28 self-start">
          <span className="font-mono uppercase text-tag tracking-widest text-ink-muted">
            Questions
          </span>
          <h2 className="font-serif italic text-h2 mt-6">
            Asked before, answered honestly<span className="text-citrus">.</span>
          </h2>
          <div className="relative hidden lg:block aspect-[4/5] max-w-[15rem] mt-10 overflow-hidden rounded-2xl shadow-lg shadow-ink/10 ring-1 ring-ink/5">
            <Image src="/images/portraits/shoaib-black-office.webp" alt="Shoaib Nabi Noor" fill sizes="240px" className="object-cover object-top" />
          </div>
        </Reveal>

        <div className="lg:col-span-8 divide-y divide-ink/10 border-y border-ink/10">
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
