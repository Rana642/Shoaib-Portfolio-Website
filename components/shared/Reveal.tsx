"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const variants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(delay, 0.2) },
  }),
};

/** Fade-up on scroll into view. Wrap any block. */
export default function Reveal({
  delay = 0,
  className,
  id,
  children,
}: {
  delay?: number;
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      id={id}
      variants={variants}
      initial={reduceMotion ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      custom={delay}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
