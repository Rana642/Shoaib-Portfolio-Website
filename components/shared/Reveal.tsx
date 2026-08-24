"use client";

import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

const variants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (delay: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay },
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
  return (
    <motion.div
      id={id}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      custom={delay}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
