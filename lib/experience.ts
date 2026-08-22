/*
 * Real work history from Shoaib (2026-08-22). Per his explicit rule,
 * adsbyshoaib.com is a "Personal Branding context" — Akhuwat Foundation
 * (his pre-2019 accounting job) and Moro Creatives are excluded here on
 * purpose. They belong only in a separate full CV/PDF document, never on
 * this site. See lib/resume.ts and the accountant-story-resume-only memory
 * for the full reasoning.
 *
 * Sanity-first via getPrimaryRoles()/getRemoteProjects(); the constants
 * below are the fallback until Shoaib adds these in the Studio.
 */
import { sanityFetch } from "./sanity/client";
import { resumeRolesQuery, resumeProjectsQuery } from "./sanity/queries";

export type Stint = { period: string; note?: string };

/** Each managed brand/property gets its own name, one-line note on what
 *  was actually done for it, and a link where Shoaib has confirmed one —
 *  never guessed, since a wrong social link on a real business is worse
 *  than no link. */
export type ManagedItem = { name: string; note?: string; url?: string };

export type PrimaryRole = {
  company: string;
  location: string;
  role: string;
  stints: Stint[];
  overview: string;
  managedLabel: string;
  managed: ManagedItem[];
  contributions: string[];
  note?: string;
};

export const primaryRoles: PrimaryRole[] = [
  {
    company: "Avenza Group of Companies",
    location: "Multan",
    role: "Digital Media Marketer",
    stints: [
      { period: "Jul 2025 — Present" },
      { period: "Jan 2024 — Mar 2024", note: "3 months" },
      { period: "Apr 2021 — Sep 2023" },
    ],
    overview:
      "Multi-brand group operating hospitality, salon, education, real estate, and event businesses across Multan — each brand runs its own independent social presence.",
    managedLabel: "Brands managed",
    managed: [
      {
        name: "Toni&Guy Multan",
        note: "International salon franchise — Meta Ads awareness campaigns",
      },
      { name: "Choppers Salon", note: "Meta Ads awareness campaigns" },
      {
        name: "Hotel Avalon Suites",
        note: "WhatsApp booking + awareness/engagement ads — the hotel had no website of its own",
      },
      {
        name: "Hotel Elegant Executive Suite Multan",
        note: "WhatsApp booking + awareness/engagement ads — later became an independent remote client with its own booking website (see below)",
      },
      { name: "Eventia 360", note: "Events — social media management and content strategy" },
      { name: "Pines Institute", note: "Education — social media management and content strategy" },
      {
        name: "AvenzaLand.com",
        note: "Real estate portal",
        url: "https://avenzaland.com",
      },
      {
        name: "Avenza Avenue",
        note: "Meta Business Suite setup and blue tick verification",
      },
    ],
    contributions: [
      "Full social media management across all brand handles — posting and content strategy",
      "Meta Ads: awareness campaigns for salons; WhatsApp booking + awareness/engagement for hotels with no websites of their own",
      "Google Business Profile creation and optimization for every brand",
      "Meta Business Suite setup and blue tick verification for Avenza Avenue",
      "Recruitment ad campaigns on Facebook for corporate hiring on the parent group page",
      "Worked alongside an in-house graphics/video/photography team — owned strategy, posting, and ads",
    ],
  },
  {
    company: "Al Mannan Builders",
    location: "DHA Multan",
    role: "Social Media Coordinator & Performance Marketer",
    stints: [
      { period: "Apr 2024 — Jun 2025" },
      { period: "Oct 2023 — Dec 2023" },
      { period: "Remote", note: "3 months during the current Avenza stint — Meta lead ads only" },
    ],
    overview:
      "Real estate construction and development company in DHA Multan, selling three home categories under one unified brand platform.",
    managedLabel: "Product categories",
    managed: [
      { name: "Lavista Smart Homes" },
      { name: "Spanish Modern Villas" },
      { name: "Aura Classic Home" },
    ],
    contributions: [
      "Full social media management and caption/content writing",
      "Meta Ads across awareness, engagement, and lead generation",
      "Instant Forms setup for lead capture on homes and construction services",
      "Google Business Profile management and optimization",
      "Kept brand messaging consistent across three product lines on one platform",
    ],
    note: "Al Mannan's Ali Pur City housing societies were not part of this scope — only DHA Multan homes and construction services.",
  },
  {
    company: "Choice Shoes",
    location: "Multan",
    role: "Digital Media Marketer",
    stints: [{ period: "Jan 2019 — Mar 2021", note: "2 years 3 months" }],
    overview:
      "E-commerce women's footwear brand based in Multan — the first formal digital marketing role after switching careers from accounting, and the first hands-on Meta Ads experience.",
    managedLabel: "Focus",
    managed: [
      { name: "choiceshoes.pk", note: "Women's footwear e-commerce", url: "https://choiceshoes.pk" },
    ],
    contributions: [
      "Social media strategy and daily content management",
      "First Meta Ads campaigns — modest results, but foundational",
      "Inbox and customer inquiry handling",
      "Google Business Profile management",
      "Website product listings and order management",
    ],
  },
];

export type RemoteProject = {
  company: string;
  role: string;
  period?: string;
  overview?: string;
  url?: string;
  services: string[];
  note?: string;
};

export const remoteProjects: RemoteProject[] = [
  {
    company: "Meezab Z. International",
    role: "Digital Marketing Consultant",
    url: "https://meezabz.com",
    overview:
      "Multan-based (founded 2014) importer/distributor of WHO-GMP & HACCP-GMP certified poultry animal-health products — exclusive Pakistan distributor for REEFCO (Jordan) and Lexington Enterprises (Singapore), covering 100+ areas across Punjab, Sindh, and Balochistan.",
    services: [
      "Built the full multi-page website — Home, About, Solutions, Products, Distributors, Contact",
      "Detailed product listing pages",
      "WhatsApp Business integration",
      "Social handles set up on Facebook, Instagram, and LinkedIn",
      "Google Business Profile optimization",
      "Brand positioning around WHO-GMP + HACCP certifications and international partnerships",
    ],
    note: "No ad campaigns run — the focus was digital presence and B2B credibility.",
  },
  {
    company: "TAD Pharma",
    role: "Digital Marketing Consultant",
    url: "https://tadpharma.pk",
    overview:
      "Multan-based importer and sole distributor of GMP/HACCP/ISO 9001:2015 certified animal health products for poultry and livestock, covering 58 cities across Pakistan.",
    services: [
      "Built a multi-page website — Home, About, Products, Distribution, Contact",
      "Product catalog",
      "WhatsApp Business integration for distributor inquiries",
      "Full digital setup",
    ],
    note: "No ad campaigns run.",
  },
  {
    company: "Hotel Elegant Executive Suite",
    role: "Full-Stack Digital Marketing",
    period: "Ongoing",
    overview:
      "Originally an Avenza Group onsite project; the hotel was leased to a new owner, and this continued as an independent remote client.",
    services: [
      "Meta Business Suite setup",
      "Social media management",
      "Meta Ads",
      "Google Ads",
      "Custom booking website with an integrated reservation system",
    ],
  },
  {
    company: "Hotel Silver Sand",
    role: "Full-Stack Digital Marketing",
    period: "Ongoing",
    overview: "Multan-based hotel offering air-conditioned rooms and free WiFi.",
    services: [
      "Meta Business Suite setup",
      "Social media management",
      "Meta Ads",
      "Google Ads",
      "Custom website with an integrated booking system",
    ],
  },
  {
    company: "Multan Law Firm",
    role: "Digital Marketing Specialist",
    period: "Aug 2023 — Present",
    services: [
      "Social media set up from zero, with ongoing posting",
      "Meta Ads for lead generation",
      "Google Business Profile management",
    ],
  },
  {
    company: "Come Live In France",
    role: "Light-Touch Digital Marketing — Remote",
    url: "https://comeliveinfrance.com",
    overview:
      "France immigration & relocation services (visas, residency, housing, healthcare) — 3,000+ expats served across 50+ countries. Founded by Serge Abi & Zainah Alyemni.",
    services: ["Page setup and ad management"],
    note: "Website not built by Shoaib — scope was page setup and ads only.",
  },
  {
    company: "Trönninge Pizza & Indisk Mat",
    role: "Light-Touch Digital Marketing — Remote",
    url: "https://tronningepizza.se",
    overview: "Italian-Indian fusion restaurant in Halmstad, Sweden.",
    services: ["Page setup and ad management"],
  },
];

export async function getPrimaryRoles(): Promise<PrimaryRole[]> {
  const fromSanity = await sanityFetch<PrimaryRole[]>(resumeRolesQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return primaryRoles;
}

export async function getRemoteProjects(): Promise<RemoteProject[]> {
  const fromSanity = await sanityFetch<RemoteProject[]>(resumeProjectsQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return remoteProjects;
}
