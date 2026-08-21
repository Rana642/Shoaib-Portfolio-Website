"use client";

/*
 * DRAFT COPY — benefit-led service one-liners, pending Shoaib's final copy.
 */
import { useRef } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Megaphone, Search, Radar, PanelsTopLeft, ArrowRight } from "lucide-react";
import Reveal from "@/components/shared/Reveal";

const services = [
  {
    icon: Megaphone,
    title: "Meta Ads",
    slug: "meta-ads",
    description:
      "Cold audiences into booked calls and carts — structured testing, deliberate scaling, and spend that answers to revenue.",
  },
  {
    icon: Search,
    title: "Google & YouTube Ads",
    slug: "google-ads",
    description:
      "Show up the moment people search for what you sell — and stay in their heads when they don't.",
  },
  {
    icon: Radar,
    title: "Tracking & Analytics",
    slug: "tracking-analytics",
    description:
      "Pixels, CAPI, GA4 — wired so every unit of spend traces back to an outcome. Managed, not just monitored.",
  },
  {
    icon: PanelsTopLeft,
    title: "Funnels & Web",
    slug: "funnels-web",
    description:
      "Landing pages built to convert the traffic you're paying for — clicks without conversions are just rent.",
  },
];

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-5, 5]), { stiffness: 200, damping: 20 });

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        x.set((e.clientX - rect.left) / rect.width - 0.5);
        y.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className="h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-shadow duration-300 hover:shadow-2xl hover:shadow-ink/10 will-change-transform"
    >
      {children}
    </motion.div>
  );
}

export default function ServicesOverview() {
  return (
    <section className="py-24 md:py-32">
      <div className="container-wide">
        <Reveal>
          <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
            What I do
          </span>
          <h2 className="font-serif italic text-h2 mt-6 max-w-2xl">
            Four pillars. One connected engine.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-14">
          {services.map((service, i) => (
            <Reveal key={service.slug} delay={i * 0.08}>
              <TiltCard>
                <service.icon className="size-8 text-cobalt" aria-hidden />
                <h3 className="font-serif italic text-h3 mt-6">{service.title}</h3>
                <p className="text-body text-ink-muted mt-3 max-w-md">{service.description}</p>
                <Link
                  href={`/services/${service.slug}`}
                  className="group/link inline-flex items-center gap-2 text-small font-medium mt-6 underline-offset-4 decoration-citrus decoration-2 hover:underline"
                >
                  Read more
                  <ArrowRight className="size-4 transition-transform group-hover/link:translate-x-1" aria-hidden />
                </Link>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
