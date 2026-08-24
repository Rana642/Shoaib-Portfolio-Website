/*
 * One-time migration: pushes the existing draft/placeholder content
 * (currently hardcoded in lib/*.ts) into Sanity documents, so Shoaib can
 * actually edit something in the Studio.
 *
 * Run with: npm run migrate:sanity
 * Safe to re-run — every document uses a deterministic ID via
 * createOrReplace(), so running it twice updates in place rather than
 * duplicating.
 */
import { createClient } from "@sanity/client";
import type { PortableTextBlock } from "next-sanity";

import { fallbackServices } from "../lib/services";
import { fallbackFaqs } from "../lib/faq";
import { fallbackTestimonials } from "../lib/testimonials";
import { fallbackPosts } from "../lib/posts";
import { primaryRoles, remoteProjects } from "../lib/experience";
import {
  summary,
  keyMetrics,
  technicalSkillGroups,
  softSkillGroups,
  languages,
  education,
  certifications,
} from "../lib/resume";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error(
    "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN in .env.local"
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Minimal Markdown -> Portable Text converter ──────────────
// Handles exactly the subset used in content/case-studies/*.mdx:
// "## " headings, "> " blockquotes, "- " bullet lists, blank-line-
// separated paragraphs. Good enough for placeholder content that
// Shoaib will rewrite in the Studio anyway.

let blockKeyCounter = 0;
const nextBlockKey = () => `b${blockKeyCounter++}`;

/** Strips bold/italic markdown markers rather than converting them to
 *  marks — good enough for placeholder content Shoaib will rewrite. */
function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "$1");
}

function textBlock(
  text: string,
  style: "normal" | "h2" | "blockquote" = "normal"
): PortableTextBlock {
  const key = nextBlockKey();
  return {
    _type: "block",
    _key: key,
    style,
    children: [{ _type: "span", _key: `${key}-s`, text: stripInlineMarkdown(text), marks: [] }],
    markDefs: [],
  };
}

function listItemBlock(text: string): PortableTextBlock {
  const key = nextBlockKey();
  return {
    _type: "block",
    _key: key,
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [{ _type: "span", _key: `${key}-s`, text: stripInlineMarkdown(text), marks: [] }],
    markDefs: [],
  } as PortableTextBlock;
}

function markdownToPortableText(markdown: string): PortableTextBlock[] {
  const lines = markdown.split("\n");
  const blocks: PortableTextBlock[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      blocks.push(textBlock(line.slice(3).trim(), "h2"));
    } else if (line.startsWith("> ")) {
      blocks.push(textBlock(line.slice(2).trim(), "blockquote"));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(listItemBlock(line.slice(2).trim()));
    } else {
      blocks.push(textBlock(line));
    }
  }

  return blocks;
}

async function migrateServices() {
  console.log(`\n— Services (${fallbackServices.length}) —`);
  for (const [index, service] of fallbackServices.entries()) {
    await client.createOrReplace({
      _id: `service-${service.slug}`,
      _type: "service",
      title: service.title,
      slug: { _type: "slug", current: service.slug },
      order: index,
      tagline: service.tagline,
      summary: service.summary,
      description: service.description,
      deliverables: service.deliverables,
      bestFor: service.bestFor,
    });
    console.log(`  ✓ ${service.title}`);
  }
}

/*
 * Real case studies — one per real brand/client from lib/experience.ts,
 * never lumped under a parent (Shoaib's explicit ask: Avenza's brands
 * each get their own case study, not one shared "Avenza" entry).
 *
 * Five of these reuse the slug of an old PLACEHOLDER case study from the
 * original build (boutique-hotel-multan, dha-real-estate, choice-shoes-
 * ecom, meezab-z-b2b-pharma, multan-law-firm) so the same URLs now serve
 * real content instead of being deleted outright.
 *
 * No outcome here is a fabricated number — where Shoaib stated a real
 * result (Multan Law Firm, Meezab Z) it's used verbatim; everywhere else
 * the "outcome" is a truthful description of what was delivered, not an
 * invented percentage.
 */
type RealCaseStudy = {
  slug: string;
  title: string;
  client: string;
  industry: string;
  excerpt: string;
  outcome: string;
  publishedAt: string;
  body: string;
};

const realCaseStudies: RealCaseStudy[] = [
  {
    slug: "boutique-hotel-multan",
    title: "From an Avenza Brand to an Independent Client, With a Real Booking Website",
    client: "Hotel Elegant Executive Suite — Multan",
    industry: "Hospitality",
    excerpt:
      "Started as one of eight Avenza Group brands with no website of its own. When the hotel was leased to a new owner, the relationship continued independently — this time with a custom booking website.",
    outcome: "From WhatsApp-only bookings to a custom reservation website",
    publishedAt: "2025-08-01",
    body: `
## The challenge

Like the other Avenza-managed hotels, Elegant Executive Suite had no website — WhatsApp booking ads and Meta engagement campaigns carried the entire digital presence.

## What changed

When the hotel was leased to a new owner, the engagement didn't end — it became an independent remote client relationship.

## What I did

- Meta Business Suite setup and social media management
- Meta Ads and Google Ads
- A custom booking website with an integrated reservation system — the upgrade the Avenza-era version never had

## The result

A property that once ran on WhatsApp messages alone now has a proper booking website behind its ad campaigns. Ongoing.
`,
  },
  {
    slug: "dha-real-estate",
    title: "One Platform, Three Home Categories: A DHA Real Estate Launch",
    client: "Al Mannan Builders",
    industry: "Real Estate",
    excerpt:
      "Three separate home categories, one unified brand platform — real estate construction and development in DHA Multan.",
    outcome: "Lead generation via Instant Forms across three home categories",
    publishedAt: "2025-06-01",
    body: `
## The challenge

Al Mannan Builders sells three distinct home categories — Lavista Smart Homes, Spanish Modern Villas, and Aura Classic Home — but wanted one consistent brand rather than three competing pages.

## What I did

- Full social media management and caption/content writing
- Meta Ads across awareness, engagement, and lead generation
- Instant Forms setup for lead capture on homes and construction services
- Google Business Profile management and optimization

## The result

Consistent messaging across three product lines without splitting the brand into three competing identities, and a steady lead-capture flow through Instant Forms.

> Scope covered DHA Multan homes and construction services only — not Al Mannan's Ali Pur City housing societies.
`,
  },
  {
    slug: "choice-shoes-ecom",
    title: "The First Meta Ads Campaign of a New Media Buying Career",
    client: "Choice Shoes",
    industry: "E-commerce",
    excerpt:
      "A Multan-based women's footwear e-commerce brand — and the first hands-on Meta Ads experience after switching careers.",
    outcome: "First Meta Ads campaigns — modest but foundational results",
    publishedAt: "2019-06-01",
    body: `
## The context

Choice Shoes (choiceshoes.pk) was the first formal digital marketing role after a career switch — and the first real Meta Ads campaigns ever run.

## What I did

- Social media strategy and daily content management
- First Meta Ads campaigns
- Inbox and customer inquiry handling
- Google Business Profile management
- Website product listings and order management

## The result

Modest results by later standards — but the foundation everything since was built on.
`,
  },
  {
    slug: "meezab-z-b2b-pharma",
    title: "Digital Presence and B2B Credibility for a Pharma Distributor",
    client: "Meezab Z. International",
    industry: "Pharma — B2B",
    excerpt:
      "Exclusive Pakistan distributor for REEFCO (Jordan) and Lexington Enterprises (Singapore), covering 100+ areas across Punjab, Sindh, and Balochistan.",
    outcome: "Full digital presence built for a 100+ area distribution network",
    publishedAt: "2024-01-01",
    body: `
## The challenge

A credible B2B distributor of WHO-GMP & HACCP-GMP certified poultry animal-health products, with no digital presence to match its international partnerships.

## What I did

- Built the full multi-page website — Home, About, Solutions, Products, Distributors, Contact
- Detailed product listing pages
- WhatsApp Business integration
- Social handles set up on Facebook, Instagram, and LinkedIn
- Google Business Profile optimization
- Brand positioning around WHO-GMP + HACCP certifications and international partnerships

## The result

No ad campaigns were run — the focus was digital presence and B2B credibility, and that's exactly what got built.
`,
  },
  {
    slug: "multan-law-firm",
    title: "Building a Law Firm's Social Presence From Zero",
    client: "Multan Law Firm",
    industry: "Legal Services",
    excerpt: "No social media presence, no lead-generation system — built both from the ground up starting August 2023.",
    outcome: "Consultation bookings up quarter over quarter",
    publishedAt: "2023-08-01",
    body: `
## The challenge

Starting from zero — no existing social media presence to build on.

## What I did

- Social media set up from scratch, with ongoing posting
- Meta Ads for lead generation
- Google Business Profile management

## The result

Consultation bookings up quarter over quarter since the engagement began in August 2023.
`,
  },
  {
    slug: "toniandguy-multan",
    title: "Running Meta Ads for an International Salon Franchise",
    client: "Toni&Guy Multan",
    industry: "Salon & Beauty",
    excerpt:
      "One of eight independently-run brands under the Avenza Group of Companies — its own Meta Ads presence for a global salon franchise's Multan location.",
    outcome: "Ongoing Meta Ads awareness campaigns",
    publishedAt: "2021-06-01",
    body: `
## The context

One of eight independently-run brands under the Avenza Group of Companies in Multan — each brand keeps its own social presence rather than sharing a single page.

## What I did

- Meta Ads awareness campaigns for the salon
- Social media handle management — posting and content strategy
- Google Business Profile creation and optimization

## The result

Consistent awareness-stage visibility for the franchise's local Multan presence, run alongside seven other Avenza-managed brands.
`,
  },
  {
    slug: "choppers-salon",
    title: "Meta Ads Awareness for a Local Salon Brand",
    client: "Choppers Salon",
    industry: "Salon & Beauty",
    excerpt:
      "Another Avenza Group salon brand, run independently from Toni&Guy Multan with its own Meta Ads and social presence.",
    outcome: "Ongoing Meta Ads awareness campaigns",
    publishedAt: "2021-06-01",
    body: `
## What I did

- Meta Ads awareness campaigns
- Social media handle management — posting and content strategy
- Google Business Profile creation and optimization

## The result

Its own independent Meta Ads presence, run in parallel with — not shared with — Toni&Guy Multan's.
`,
  },
  {
    slug: "hotel-avalon-suites",
    title: "Booking Ads for a Hotel With No Website",
    client: "Hotel Avalon Suites",
    industry: "Hospitality",
    excerpt: "No website, no problem — WhatsApp booking ads and Meta engagement campaigns carried the entire digital presence.",
    outcome: "WhatsApp booking ads driving direct inquiries",
    publishedAt: "2021-06-01",
    body: `
## The challenge

The hotel had no website of its own — every booking inquiry had to be captured some other way.

## What I did

- WhatsApp booking ads and Meta awareness/engagement campaigns
- Google Business Profile creation and optimization
- Social media management under the Avenza Group umbrella

## The result

A working booking funnel built entirely on WhatsApp and social — proof that a missing website doesn't have to mean a missing digital presence.
`,
  },
  {
    slug: "eventia-360",
    title: "Social Media Presence for an Events Brand",
    client: "Eventia 360",
    industry: "Events",
    excerpt: "One of the Avenza Group's brands, running its own independent social media presence for the events business.",
    outcome: "Ongoing social media management",
    publishedAt: "2021-06-01",
    body: `
## What I did

- Social media management and content strategy
- Google Business Profile creation and optimization

## The result

Its own brand identity and posting cadence, distinct from the rest of the Avenza Group portfolio.
`,
  },
  {
    slug: "pines-institute",
    title: "Social Media Presence for an Education Brand",
    client: "Pines Institute",
    industry: "Education",
    excerpt: "One of the Avenza Group's brands, running its own independent social media presence for the education business.",
    outcome: "Ongoing social media management",
    publishedAt: "2021-06-01",
    body: `
## What I did

- Social media management and content strategy
- Google Business Profile creation and optimization

## The result

An education brand with its own voice, run independently of the group's other seven brands.
`,
  },
  {
    slug: "avenzaland",
    title: "Building the Digital Presence for a Real Estate Portal",
    client: "AvenzaLand.com",
    industry: "Real Estate",
    excerpt: "The Avenza Group's real estate portal, run as its own brand with its own social and web presence.",
    outcome: "Real estate portal launched and managed",
    publishedAt: "2021-06-01",
    body: `
## What I did

- Social media management and content strategy for the portal
- Google Business Profile creation and optimization

## The result

A dedicated real estate brand under the Avenza umbrella, distinct from the group's hospitality and salon brands.
`,
  },
  {
    slug: "avenza-avenue",
    title: "Meta Business Suite Setup and Verification for the Parent Brand",
    client: "Avenza Avenue",
    industry: "Corporate & Recruitment",
    excerpt: "The Avenza Group's own page — used primarily for corporate hiring and recruitment rather than consumer marketing.",
    outcome: "Meta Business Suite setup + blue-tick verification",
    publishedAt: "2021-06-01",
    body: `
## What I did

- Meta Business Suite subscription setup and blue tick verification
- Recruitment ad campaigns on Facebook for corporate hiring across the group

## The result

A verified, properly configured Business Suite behind the group's hiring campaigns.
`,
  },
  {
    slug: "tad-pharma",
    title: "A Digital Foundation for a 58-City Distribution Network",
    client: "TAD Pharma",
    industry: "Pharma — B2B",
    excerpt: "Multan-based importer and sole distributor of certified animal health products, covering 58 cities across Pakistan.",
    outcome: "Full digital presence built — website, catalog, WhatsApp",
    publishedAt: "2024-03-01",
    body: `
## What I did

- Built a multi-page website — Home, About, Products, Distribution, Contact
- Product catalog
- WhatsApp Business integration for distributor inquiries
- Full digital setup

## The result

No ad campaigns were run — the focus was a complete, credible digital foundation for a 58-city distributor network.
`,
  },
  {
    slug: "hotel-silver-sand",
    title: "Full-Stack Digital Marketing for a Multan Hotel",
    client: "Hotel Silver Sand",
    industry: "Hospitality",
    excerpt:
      "Meta Business Suite, social media, paid ads, and a custom website with an integrated booking system, all in one engagement.",
    outcome: "Full-stack digital marketing — ongoing",
    publishedAt: "2025-01-01",
    body: `
## What I did

- Meta Business Suite setup and social media management
- Meta Ads and Google Ads
- Custom website with an integrated booking system

## The result

A complete digital operation for a hotel offering air-conditioned rooms and free WiFi — ongoing.
`,
  },
  {
    slug: "come-live-in-france",
    title: "Page Management for a France Relocation Service",
    client: "Come Live In France (CLIF)",
    industry: "Immigration & Relocation",
    excerpt:
      "France immigration & relocation services — visas, residency, housing, healthcare — for a company that's served 3,000+ expats across 50+ countries.",
    outcome: "Ongoing page management and ad delivery",
    publishedAt: "2024-06-01",
    body: `
## What I did

- Page setup and ongoing ad management

> Website not built by Shoaib — scope was page setup and ads only.

## The result

A light-touch, ongoing engagement supporting a company with 3,000+ expats served across 50+ countries.
`,
  },
  {
    slug: "tronninge-pizza",
    title: "Page Management for a Sweden Restaurant",
    client: "Trönninge Pizza & Indisk Mat",
    industry: "Restaurant",
    excerpt: "An Italian-Indian fusion restaurant in Halmstad, Sweden — page setup and ongoing ad management.",
    outcome: "Ongoing page management and ad delivery",
    publishedAt: "2024-09-01",
    body: `
## What I did

- Page setup and ongoing ad management

## The result

A light-touch, ongoing engagement keeping the restaurant's page active and its ads running.
`,
  },
];

async function migrateCaseStudies() {
  console.log(`\n— Case studies (${realCaseStudies.length}) —`);
  for (const cs of realCaseStudies) {
    await client.createOrReplace({
      _id: `caseStudy-${cs.slug}`,
      _type: "caseStudy",
      title: cs.title,
      slug: { _type: "slug", current: cs.slug },
      industry: cs.industry,
      client: cs.client,
      excerpt: cs.excerpt,
      outcome: cs.outcome,
      publishedAt: new Date(cs.publishedAt).toISOString(),
      body: markdownToPortableText(cs.body),
    });
    console.log(`  ✓ ${cs.client}`);
  }
}

async function migratePosts() {
  console.log(`\n— Blog posts (${fallbackPosts.length}) —`);
  for (const post of fallbackPosts) {
    await client.createOrReplace({
      _id: `post-${post.slug}`,
      _type: "post",
      title: post.title,
      slug: { _type: "slug", current: post.slug },
      excerpt: post.excerpt,
      category: post.category,
      publishedAt: new Date(post.publishedAt).toISOString(),
      body: post.body,
    });
    console.log(`  ✓ ${post.title}`);
  }
}

async function migrateFaqs() {
  console.log(`\n— FAQs (${fallbackFaqs.length}) —`);
  for (const [index, faq] of fallbackFaqs.entries()) {
    await client.createOrReplace({
      _id: `faq-${index}`,
      _type: "faqItem",
      question: faq.q,
      answer: faq.a,
      order: index,
    });
    console.log(`  ✓ ${faq.q}`);
  }
}

async function migrateTestimonials() {
  console.log(`\n— Testimonials (${fallbackTestimonials.length}) —`);
  for (const [index, t] of fallbackTestimonials.entries()) {
    await client.createOrReplace({
      _id: `testimonial-${index}`,
      _type: "testimonial",
      headline: t.headline,
      quote: t.quote,
      author: t.author,
      context: t.context,
      order: index,
    });
    console.log(`  ✓ ${t.headline}`);
  }
}

async function migrateResumeRoles() {
  console.log(`\n— Resume primary roles (${primaryRoles.length}) —`);
  for (const [index, role] of primaryRoles.entries()) {
    await client.createOrReplace({
      _id: `resumeRole-${slugify(role.company)}`,
      _type: "resumeRole",
      company: role.company,
      location: role.location,
      role: role.role,
      order: index,
      stints: role.stints.map((s) => ({ _type: "stint", _key: nextBlockKey(), ...s })),
      overview: role.overview,
      managedLabel: role.managedLabel,
      managed: role.managed.map((m) => ({ _type: "managedItem", _key: nextBlockKey(), ...m })),
      contributions: role.contributions,
      note: role.note,
    });
    console.log(`  ✓ ${role.company}`);
  }
}

async function migrateResumeProjects() {
  console.log(`\n— Resume remote/client projects (${remoteProjects.length}) —`);
  for (const [index, project] of remoteProjects.entries()) {
    await client.createOrReplace({
      _id: `resumeProject-${slugify(project.company)}`,
      _type: "resumeProject",
      company: project.company,
      role: project.role,
      order: index,
      period: project.period,
      overview: project.overview,
      url: project.url,
      services: project.services,
      note: project.note,
    });
    console.log(`  ✓ ${project.company}`);
  }
}

/**
 * IDs from earlier versions of this script that no longer exist in the
 * source data — e.g. "International Clients" was split into two
 * separate projects since each deserves its own card, not a shared one.
 * createOrReplace() never deletes a removed document on its own, so
 * anything renamed/split/removed goes here once.
 */
const obsoleteDocumentIds = ["resumeProject-international-clients"];

async function cleanupObsoleteDocuments() {
  if (obsoleteDocumentIds.length === 0) return;
  console.log(`\n— Removing ${obsoleteDocumentIds.length} obsolete document(s) —`);
  for (const id of obsoleteDocumentIds) {
    // Re-running this script after the first cleanup means the document is
    // already gone — that's success, not a failure to report.
    try {
      await client.delete(id);
      console.log(`  ✓ deleted ${id}`);
    } catch {
      console.log(`  · ${id} already gone`);
    }
  }
}

async function migrateResumePage() {
  console.log("\n— Resume page content —");
  await client.createOrReplace({
    _id: "resumePage",
    _type: "resumePage",
    summary,
    metrics: keyMetrics.map((m) => ({ _type: "metric", _key: nextBlockKey(), ...m })),
    techSkillGroups: technicalSkillGroups.map((g) => ({
      _type: "skillGroup",
      _key: nextBlockKey(),
      ...g,
    })),
    softSkillGroups: softSkillGroups.map((g) => ({
      _type: "softSkillGroup",
      _key: nextBlockKey(),
      ...g,
    })),
    languages: languages.map((l) => ({ _type: "language", _key: nextBlockKey(), ...l })),
    education: education.map((e) => ({
      _type: "educationEntry",
      _key: nextBlockKey(),
      ...e,
    })),
    certifications: certifications.map((c) => ({
      _type: "certification",
      _key: nextBlockKey(),
      ...c,
    })),
  });
  console.log("  ✓ Summary, metrics, skills, languages, education, certifications");
}

async function main() {
  console.log(`Migrating draft content into Sanity project ${projectId} (${dataset})...`);

  await migrateServices();
  await migrateCaseStudies();
  await migratePosts();
  await migrateFaqs();
  await migrateTestimonials();
  await migrateResumeRoles();
  await migrateResumeProjects();
  await migrateResumePage();
  await cleanupObsoleteDocuments();

  console.log("\nDone. Open /studio to review and edit.");
}

main().catch((error) => {
  console.error("\nMigration failed:", error);
  process.exit(1);
});
