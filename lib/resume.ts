/*
 * Real CV data provided by Shoaib (2026-08-22). Work experience lives in
 * lib/experience.ts.
 *
 * Sanity-first via getResumeContent() — reads the "resumePage" singleton
 * from the Studio and falls back per-field to the constants below, so a
 * partially-filled Studio document never blanks out a section.
 *
 * Personal Information (father's name, CNIC, marital status) is
 * intentionally NOT included here — a government ID number should not be
 * published on a public, potentially-indexed website. It stays in the
 * private PDF workflow only (scripts/generate-resume-pdf.tsx notes).
 */
import { sanityFetch } from "./sanity/client";
import { resumePageQuery } from "./sanity/queries";

export const summary =
  "Performance marketing specialist with 6+ years of experience and $2.5M+ in managed advertising spend across Meta, Google, YouTube, and TikTok. Full-stack digital marketing capability spanning campaign strategy, media buying, conversion tracking, website and funnel development, and lead generation. Industry experience spans real estate, hospitality, salons, e-commerce, legal services, education, and B2B animal-health pharmaceuticals — with clients across Pakistan and internationally (France, Sweden). Currently operating Ads by Shoaib as an independent practice, with a trusted network of specialists supporting creative production.";

export const keyMetrics = [
  { value: "6+", label: "Years in digital marketing" },
  { value: "$2.5M+", label: "Managed ad spend" },
  { value: "4", label: "Ad platforms mastered" },
  { value: "8+", label: "Industries served" },
  { value: "15+", label: "Brands worked with" },
  { value: "PK · FR · SE", label: "International reach" },
];

export const technicalSkillGroups = [
  {
    category: "Paid Advertising & Media Buying",
    items: [
      "Meta Ads (Facebook & Instagram) — Awareness, Engagement, Lead Gen, WhatsApp campaigns",
      "Google Ads — Search, Display, Performance Max, Shopping",
      "YouTube Ads — Awareness & Remarketing",
      "TikTok Ads — Content marketing & conversions",
      "Full-funnel campaign architecture",
      "A/B testing & creative optimization",
      "Bid strategy & budget management",
      "Audience research & targeting",
      "Retargeting & lookalike audiences",
      "WhatsApp booking ads",
    ],
  },
  {
    category: "Analytics & Tracking",
    items: [
      "Google Analytics 4 (GA4) — event tracking, conversions, audiences",
      "Google Tag Manager (GTM) — full container setup",
      "Google Search Console",
      "Meta Pixel + Conversion API (server-side tracking)",
      "Google Ads Conversion Tracking + Enhanced Conversions",
      "TikTok Pixel",
      "Cross-domain & cross-platform attribution",
      "Data Studio / Looker Studio reporting",
    ],
  },
  {
    category: "Web Development & Funnels",
    items: [
      "Next.js (React framework)",
      "Website development & deployment",
      "Landing page design & optimization",
      "Booking systems (hotel PMS, appointment systems)",
      "E-commerce operations",
      "Funnel strategy & architecture",
      "Email marketing (welcome sequences, abandoned cart, review requests)",
      "Retargeting sequences",
      "Conversion rate optimization (CRO)",
      "Payment gateway integration (Stripe, PayPal, JazzCash, HBL)",
      "Supabase (database + authentication)",
      "WhatsApp Cloud API integration",
    ],
  },
  {
    category: "Presence & Brand Setup",
    items: [
      "Meta Business Manager & Suite setup",
      "Blue tick verification (Meta)",
      "Social media handle creation & optimization",
      "Google Business Profile (creation, verification, optimization)",
      "Content strategy & scheduling",
      "Copywriting for ads, websites, and social content",
      "Brand positioning",
      "Local SEO",
    ],
  },
  {
    category: "SEO & Content",
    items: [
      "On-page SEO",
      "Technical SEO fundamentals",
      "Local SEO",
      "AI Search Optimization (AEO)",
      "Content strategy & planning",
      "Blog content development",
      "Schema markup implementation",
    ],
  },
  {
    category: "Tools & Platforms",
    items: [
      "Meta Business Manager",
      "Google Ads Manager (MCC)",
      "Google Analytics 4",
      "Google Tag Manager",
      "Google Search Console",
      "TikTok Ads Manager",
      "YouTube Studio",
      "Sanity CMS",
      "Channex (channel manager)",
      "Zoho, HubSpot (CRM familiarity)",
      "Vercel, Supabase",
      "WhatsApp Business Cloud API",
      "Resend (email API)",
      "Make.com (automation)",
    ],
  },
  {
    category: "Data & Reporting",
    items: [
      "MS Excel (advanced formulas, pivot tables)",
      "Data analysis & interpretation",
      "Performance reporting & dashboards",
      "ROI/ROAS calculation",
      "Cost per acquisition (CPA) optimization",
    ],
  },
];

export const softSkillGroups = [
  {
    category: "Communication",
    items: [
      "Client relationship management",
      "Cross-functional team collaboration",
      "Clear technical communication for non-technical audiences",
      "Written communication (proposals, reports, contracts)",
      "Presentation & pitching",
    ],
  },
  {
    category: "Leadership & Management",
    items: [
      "Independent project ownership",
      "Vendor/collaborator management",
      "Team coordination (graphics, video, photography specialists)",
      "Client onboarding & lifecycle management",
      "Strategic decision-making",
    ],
  },
  {
    category: "Analytical & Problem-Solving",
    items: [
      "Data-driven decision making",
      "Root cause analysis",
      "Campaign troubleshooting",
      "Attribution analysis",
      "Budget allocation optimization",
    ],
  },
  {
    category: "Business Acumen",
    items: [
      "Understanding of business fundamentals (accounting background)",
      "ROI-focused mindset",
      "Client business goal alignment",
      "Multi-industry adaptability",
      "Financial literacy from an accounting foundation",
    ],
  },
  {
    category: "Personal Attributes",
    items: [
      "Self-motivated & entrepreneurial",
      "Detail-oriented",
      "Deadline-driven",
      "Continuous learner — adapts to platform changes",
      "Ethical & transparent client dealings",
      "Solution-oriented, not just service-oriented",
      "Cross-cultural client experience (Pakistan, France, Sweden)",
    ],
  },
];

export const languages = [
  { name: "English", level: "Professional working proficiency (spoken & written)" },
  { name: "Urdu", level: "Native" },
  { name: "Punjabi", level: "Native" },
  { name: "Chinese (Mandarin)", level: "Basic proficiency" },
];

export const education = [
  {
    degree: "Bachelor of Commerce (B.Com)",
    institution: "Bahauddin Zakariya University, Multan",
    period: "Completed 2012 · 2nd Division",
  },
  {
    degree: "Higher Secondary School Certificate (HSSC)",
    institution: "Board of Intermediate & Secondary Education, Multan",
    period: "Completed 2008 · 2nd Division",
  },
  {
    degree: "Secondary School Certificate (SSC)",
    institution: "Board of Intermediate & Secondary Education, Multan",
    period: "Completed 2006 · 2nd Division",
  },
];

export const certifications = [
  {
    title: "Soft Skills Training Certificate",
    issuer:
      "Overseas Employment Corporation (OEC) & International Centre for Migration Policy Development (ICMPD)",
    detail: "11 Days / 22 Hours — completed October 15, 2025",
    note: "Certificate No. 26cc3a76 — signed by Ms. Marija Raus (Head of Region Silk Routes, ICMPD) and Mr. Naseer Khan Kashani (Managing Director, OEC)",
  },
];

export const socialProfiles = [
  { label: "LinkedIn", handle: "linkedin.com/in/shoaibnabinoor", href: "https://linkedin.com/in/shoaibnabinoor" },
  { label: "Facebook", handle: "@shoaibnabinoor", href: "https://facebook.com/shoaibnabinoor" },
  { label: "X (Twitter)", handle: "@ShoaibNabiNoor1", href: "https://x.com/ShoaibNabiNoor1" },
  { label: "Instagram", handle: "@shoaib.nabi.noor", href: "https://instagram.com/shoaib.nabi.noor" },
];

export type ResumeContent = {
  summary: string;
  keyMetrics: typeof keyMetrics;
  technicalSkillGroups: typeof technicalSkillGroups;
  softSkillGroups: typeof softSkillGroups;
  languages: typeof languages;
  education: typeof education;
  certifications: typeof certifications;
};

type SanityResumePage = {
  summary?: string;
  metrics?: { value: string; label: string }[];
  techSkillGroups?: { category: string; items: string[] }[];
  softSkillGroups?: { category: string; items: string[] }[];
  languages?: { name: string; level: string }[];
  education?: { degree: string; institution: string; period: string }[];
  certifications?: { title: string; issuer: string; detail: string; note?: string }[];
};

/** Per-field merge: any section left empty in the Studio keeps its fallback. */
export async function getResumeContent(): Promise<ResumeContent> {
  const doc = await sanityFetch<SanityResumePage | null>(resumePageQuery);
  return {
    summary: doc?.summary || summary,
    keyMetrics: doc?.metrics?.length ? doc.metrics : keyMetrics,
    technicalSkillGroups: doc?.techSkillGroups?.length ? doc.techSkillGroups : technicalSkillGroups,
    softSkillGroups: doc?.softSkillGroups?.length ? doc.softSkillGroups : softSkillGroups,
    languages: doc?.languages?.length ? doc.languages : languages,
    education: doc?.education?.length ? doc.education : education,
    certifications: doc?.certifications?.length
      ? doc.certifications.map((c) => ({ ...c, note: c.note ?? "" }))
      : certifications,
  };
}
