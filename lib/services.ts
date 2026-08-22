/*
 * Services data layer. Sanity-first once documents exist in the Studio;
 * falls back to the draft copy below (DRAFT COPY, pending Shoaib's final
 * copy files) while the Studio is empty. Icons map by slug in the
 * components — new Studio-created slugs get a default icon.
 */
import { sanityFetch } from "./sanity/client";
import { allServicesQuery, serviceBySlugQuery } from "./sanity/queries";

export type Service = {
  slug: string;
  title: string;
  tagline: string;
  summary: string;
  description: string[];
  deliverables: string[];
  bestFor: string[];
};

export const fallbackServices: Service[] = [
  {
    slug: "meta-ads",
    title: "Meta Ads",
    tagline: "Cold audiences into customers, on purpose.",
    summary:
      "Cold audiences into booked calls and carts — structured testing, deliberate scaling, and spend that answers to revenue.",
    description: [
      "Most Meta accounts fail in the structure, not the ads. Too many campaigns, overlapping audiences, and creative that was never actually tested — just rotated.",
      "I rebuild accounts around a simple discipline: every dollar has a job, every creative is a hypothesis, and every week ends with a decision. Testing tells us what to scale; scaling is done deliberately, not by doubling budgets and praying.",
    ],
    deliverables: [
      "Full account audit and restructure",
      "Creative testing matrix — hooks, angles, formats",
      "Audience and offer strategy",
      "Weekly optimization decisions, documented",
      "Monthly report you can read without a glossary",
    ],
    bestFor: ["E-commerce brands", "Local service businesses", "Real estate", "Hospitality"],
  },
  {
    slug: "google-ads",
    title: "Google & YouTube Ads",
    tagline: "Own the moment of intent.",
    summary:
      "Show up the moment people search for what you sell — and stay in their heads when they don't.",
    description: [
      "Search traffic is the warmest traffic you will ever buy — people telling you, in their own words, exactly what they want. The waste happens in broad match left unsupervised, bloated keyword lists, and Performance Max treated as a black box.",
      "I run Search, Performance Max, and YouTube as one system: intent capture at the bottom, brand memory at the top, and negative keyword discipline holding the budget line throughout.",
    ],
    deliverables: [
      "Keyword and competitor mapping",
      "Search + Performance Max structure",
      "YouTube campaigns for remarketing and reach",
      "Negative keyword discipline, maintained weekly",
      "Conversion-based bidding built on clean data",
    ],
    bestFor: ["High-intent services", "B2B pipelines", "E-commerce", "Local businesses"],
  },
  {
    slug: "tracking-analytics",
    title: "Tracking & Analytics",
    tagline: "If it can't be measured, it doesn't get spent.",
    summary:
      "Pixels, CAPI, GA4 — wired so every unit of spend traces back to an outcome. Managed, not just monitored.",
    description: [
      "Half the 'ads don't work' stories I audit turn out to be 'tracking was never set up' stories. Decisions were being made on numbers that were quietly wrong.",
      "I wire the full measurement stack — pixel, Conversions API, GA4, Tag Manager — before scaling a single campaign. When the data is trustworthy, every other decision gets easier and cheaper.",
    ],
    deliverables: [
      "Meta Pixel + Conversions API (server-side) setup",
      "GA4 and Google Tag Manager configuration",
      "Conversion and event mapping across the funnel",
      "Attribution sanity checks against real revenue",
      "A dashboard with the five numbers that matter",
    ],
    bestFor: ["Anyone spending before measuring", "E-commerce", "Lead-gen funnels", "Multi-channel accounts"],
  },
  {
    slug: "funnels-web",
    title: "Funnels & Web",
    tagline: "Where clicks become customers.",
    summary:
      "Landing pages built to convert the traffic you're paying for — clicks without conversions are just rent.",
    description: [
      "You can win the auction and still lose the sale — on a slow page, a vague headline, or a form that asks for too much too soon. Traffic you paid for deserves a page built to receive it.",
      "I plan and build landing pages and funnels that match the ad's promise, load fast, and ask for exactly one action. Design and development run through my specialist network; the strategy, copy direction, and conversion logic stay with me.",
    ],
    deliverables: [
      "Funnel audit — where the leaks actually are",
      "Landing page strategy and wireframes",
      "Copy direction matched to ad messaging",
      "Build via specialist network, managed end-to-end",
      "Post-launch conversion tracking and iteration",
    ],
    bestFor: ["Paid traffic that isn't converting", "New offers and launches", "Lead-gen campaigns", "E-commerce promos"],
  },
];

export async function getServices(): Promise<Service[]> {
  const fromSanity = await sanityFetch<Service[]>(allServicesQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return fallbackServices;
}

export async function getService(slug: string): Promise<Service | undefined> {
  const fromSanity = await sanityFetch<Service | null>(serviceBySlugQuery, { slug });
  if (fromSanity) return fromSanity;
  return fallbackServices.find((s) => s.slug === slug);
}
