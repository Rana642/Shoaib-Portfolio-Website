/*
 * Testimonials data layer. Sanity-first; falls back to the PLACEHOLDER
 * quotes below until Shoaib collects real client testimonials and adds
 * them in the Studio.
 */
import { sanityFetch } from "./sanity/client";
import { testimonialsQuery } from "./sanity/queries";

export type Testimonial = {
  headline: string;
  quote: string;
  author: string;
  context?: string;
};

const fallbackTestimonials: Testimonial[] = [
  {
    headline: "Direct bookings tripled in one quarter",
    quote:
      "We stopped guessing. Every week we knew what was being tested, what it cost, and what it returned. Bookings from our own website tripled.",
    author: "Owner, boutique hotel",
    context: "Hospitality — Multan",
  },
  {
    headline: "Finally, reports we can actually read",
    quote:
      "Previous agencies sent dashboards. Shoaib sends decisions — what changed, why, and what it did to our cost per lead.",
    author: "Marketing lead, property firm",
    context: "Real Estate — DHA",
  },
  {
    headline: "Profitable ads within 60 days",
    quote:
      "We'd burned budget twice before with nothing to show. This time the tracking was set up before a single ad ran. That discipline paid for itself.",
    author: "Founder, footwear brand",
    context: "E-commerce",
  },
];

export async function getTestimonials(): Promise<Testimonial[]> {
  const fromSanity = await sanityFetch<Testimonial[]>(testimonialsQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return fallbackTestimonials;
}
