/*
 * Testimonials data layer. Real client quotes only, from Sanity. The home
 * page does not render this section until real testimonials exist (the
 * Studio still holds the old placeholder quotes — delete them there).
 */
import { sanityFetch } from "./sanity/client";
import { testimonialsQuery } from "./sanity/queries";

export type Testimonial = {
  headline: string;
  quote: string;
  author: string;
  context?: string;
};

// Deliberately empty: the site shows only real client quotes. The old
// placeholder quotes were removed on 2026-09-28 at Shoaib's request.
export const fallbackTestimonials: Testimonial[] = [];

export async function getTestimonials(): Promise<Testimonial[]> {
  const fromSanity = await sanityFetch<Testimonial[]>(testimonialsQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return fallbackTestimonials;
}
