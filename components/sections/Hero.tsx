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
      <div className="container-wide grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center pt-8 pb-12 md:pt-12 md:pb-14 lg:pt-10 lg:pb-16">
        {/* Text — 60% */}
        <div className="lg:col-span-7">
          <motion.div variants={fadeUp} initial={false} animate="visible" custom={0}>
            <Tag>
              Performance marketing consultant
              <span className="hidden sm:inline"> · Meta &amp; Google Ads</span>
            </Tag>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            initial={false}
            animate="visible"
            custom={1}
            className="font-serif italic text-[clamp(2.5rem,4.2vw,3.75rem)] leading-[1.05] tracking-[-0.02em] mt-6"
          >
            Performance marketing that brings{" "}
            <span className="relative whitespace-nowrap">
              {/* Citrus marker-highlight keeps text ink for contrast */}
              <span className="absolute inset-x-0 bottom-1 h-[38%] bg-citrus/60 -z-10 -rotate-1 rounded-sm" />
              customers
            </span>
            , not just clicks<span className="text-cobalt">.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            initial={false}
            animate="visible"
            custom={2}
            className="text-body-lg text-ink-muted mt-5 max-w-xl"
          >
            I find where your ad spend leaks, fix it, and scale what works across{" "}
            <strong className="text-ink font-semibold">Meta, Google, YouTube, and TikTok</strong>.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial={false}
            animate="visible"
            custom={3}
            className="flex flex-wrap gap-4 mt-8"
          >
            <Button href="/contact" withArrow>
              Get a free audit
            </Button>
            <Button href="/case-studies" variant="secondary" withArrow>
              See the results
            </Button>
          </motion.div>
          <motion.p
            variants={fadeUp}
            initial={false}
            animate="visible"
            custom={3}
            className="text-small text-ink-muted mt-4"
          >
            30-minute call. No pitch. You leave with a fix list.
          </motion.p>

          <motion.dl
            variants={fadeUp}
            initial={false}
            animate="visible"
            custom={4}
            className="flex flex-wrap gap-x-12 gap-y-6 mt-10 pt-6 border-t border-ink/10"
          >
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-serif italic text-h2 leading-none">{stat.value}</dd>
                <dd className="font-mono uppercase text-tag tracking-widest text-ink-muted mt-3">
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
          className="lg:col-span-5"
        >
          <div className="hero-tilt relative aspect-[4/5] max-w-[16rem] sm:max-w-sm mx-auto lg:max-w-none">
            <div aria-hidden className="absolute left-1/2 bottom-[6%] -translate-x-1/2 w-[92%] aspect-square rounded-full bg-citrus/30" />
            <div aria-hidden className="absolute left-1/2 bottom-[6%] -translate-x-1/2 w-[92%] aspect-square rounded-full border border-cobalt/30 translate-y-3 scale-[1.04]" />
            <Image
              src="/images/shoaib-cutout.png"
              alt="Shoaib Nabi Noor — performance marketing specialist"
              fill
              priority
              sizes="(max-width: 1024px) 384px, 40vw"
              className="object-contain object-bottom [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
