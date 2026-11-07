import { Plus_Jakarta_Sans, Inter } from "next/font/google";

/** Headings: a clean geometric sans used by modern agencies and SaaS brands. */
export const headingFont = Plus_Jakarta_Sans({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

/** Body, labels and numbers. */
export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
