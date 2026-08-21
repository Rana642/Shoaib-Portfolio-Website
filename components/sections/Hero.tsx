"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform } from "framer-motion";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";

const stats = [
  { value: "$2.5M+", label: "Ad spend managed" },
  { value: "6+ yrs", label: "In paid media" },
  { value: "8", label: "Industries served" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay: 0.2 * i },
  }),
};

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, 80]);

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="container-wide grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-center py-20 md:py-28 lg:py-32">
        {/* Text — 60% */}
        <div className="lg:col-span-3">
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
            <Tag>Ads by Shoaib · Performance Marketing</Tag>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={1}
            className="font-serif italic text-hero mt-8"
          >
            The marketing engine,{" "}
            <span className="relative whitespace-nowrap">
              {/* Citrus marker-highlight keeps text ink for contrast */}
              <span className="absolute inset-x-0 bottom-1 h-[38%] bg-citrus/60 -z-10 -rotate-1 rounded-sm" />
              fully assembled
            </span>
            <span className="text-cobalt">.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={2}
            className="text-body-lg text-ink-muted mt-6 max-w-xl"
          >
            Independent performance marketing practice led by{" "}
            <strong className="text-ink font-semibold">Shoaib Nabi Noor</strong> — turning
            strategy, targeting, and creative into leads, bookings, and sales across{" "}
            <strong className="text-ink font-semibold">Meta, Google, YouTube, and TikTok</strong>.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="flex flex-wrap gap-4 mt-10"
          >
            <Button href="/case-studies" withArrow>
              See the results
            </Button>
            <Button href="/contact" variant="secondary" withArrow>
              Get a free audit
            </Button>
          </motion.div>

          <motion.dl
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={4}
            className="flex flex-wrap gap-x-12 gap-y-6 mt-14 pt-8 border-t border-ink/10"
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-serif italic text-h3 leading-none">{stat.value}</dd>
                <dd className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-2">
                  {stat.label}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Image — 40% */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          style={{ y: imageY }}
          className="lg:col-span-2 order-first lg:order-none"
        >
          <div className="hero-tilt relative aspect-[4/5] max-w-sm mx-auto lg:max-w-none rounded-2xl overflow-hidden shadow-2xl shadow-citrus/25">
            <Image
              src="/images/shoaib.png"
              alt="Shoaib Nabi Noor — performance marketing specialist"
              fill
              priority
              sizes="(max-width: 1024px) 384px, 40vw"
              className="object-cover"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
