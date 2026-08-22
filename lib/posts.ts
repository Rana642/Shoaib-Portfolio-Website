/*
 * Blog data layer. Pulls from Sanity once NEXT_PUBLIC_SANITY_PROJECT_ID is
 * set (see README "Sanity Studio" section); until then, falls back to the
 * two placeholder posts below so local dev and the build don't need a
 * live project. Both paths return the same shape, so pages never branch
 * on the source.
 *
 * The second post from the build doc ("From Accountant to Media Buyer")
 * is intentionally NOT drafted — accountant story placement is pending
 * Shoaib's decision (Resume-only rule).
 */
import type { PortableTextBlock } from "next-sanity";
import { client } from "./sanity/client";
import { isSanityConfigured } from "./sanity/env";
import { allPostsQuery, postBySlugQuery } from "./sanity/queries";

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  body: PortableTextBlock[];
};

export const categories = [
  "Meta Ads",
  "Google Ads",
  "Tracking",
  "Funnels & Web",
  "Case Studies",
  "Opinions",
  "Personal Brand",
] as const;

function paragraph(text: string, key: string): PortableTextBlock {
  return {
    _type: "block",
    _key: key,
    style: "normal",
    children: [{ _type: "span", _key: `${key}-span`, text, marks: [] }],
    markDefs: [],
  };
}

const fallbackPosts: Post[] = [
  {
    slug: "reduce-meta-ads-cost-per-lead",
    title: "How to Reduce Meta Ads Cost Per Lead by 40% — A Media Buyer's Field Guide",
    excerpt:
      "Most CPL problems aren't budget problems. They're structure, creative, and tracking problems wearing a budget costume.",
    category: "Meta Ads",
    publishedAt: "2026-08-01",
    body: [
      paragraph(
        "Placeholder draft — the full post publishes through Sanity Studio in Phase 5. The outline below is the working skeleton.",
        "p1"
      ),
      paragraph(
        "When a client tells me their cost per lead has crept up, the ad budget is almost never the culprit. In six years of audits, the same three leaks show up in nearly every account: campaign structure that fragments the learning data, creative that stopped being tested the day the account launched, and tracking that quietly undercounts the leads that do arrive.",
        "p2"
      ),
      paragraph(
        "This field guide walks through the exact sequence I use to bring CPL down — structure consolidation first, then a creative testing matrix with honest kill criteria, then conversion-event hygiene so the algorithm optimizes toward the leads your sales team actually wants.",
        "p3"
      ),
    ],
  },
  {
    slug: "your-ads-arent-broken-your-tracking-is",
    title: "Your Ads Aren't Broken. Your Tracking Is.",
    excerpt:
      "Half the 'ads don't work' stories I audit turn out to be measurement stories. Here's how to tell which one yours is.",
    category: "Tracking",
    publishedAt: "2026-08-15",
    body: [
      paragraph(
        "Placeholder draft — the full post publishes through Sanity Studio in Phase 5. The outline below is the working skeleton.",
        "p1"
      ),
      paragraph(
        "Before you kill a campaign, ask one question: do you trust the number that's telling you it failed? Pixel-only setups lose events to browsers and ad blockers every single day, and the campaigns spending in the right places often look worst in a broken report.",
        "p2"
      ),
      paragraph(
        "This post covers the five-minute checks I run before touching any budget — event deduplication, Conversions API match quality, GA4 cross-checks against real revenue — and what each mismatch pattern usually means.",
        "p3"
      ),
    ],
  },
];

export async function getAllPosts(): Promise<Post[]> {
  if (!isSanityConfigured) return fallbackPosts;
  return client.fetch(allPostsQuery);
}

export async function getPost(slug: string): Promise<Post | undefined> {
  if (!isSanityConfigured) return fallbackPosts.find((p) => p.slug === slug);
  const post = await client.fetch(postBySlugQuery, { slug });
  return post ?? undefined;
}

export async function getPostsByCategory(categorySlugValue: string): Promise<Post[]> {
  const all = await getAllPosts();
  return all.filter((p) => categorySlug(p.category) === categorySlugValue);
}

/** Rough estimate — 200 words/minute over the plain text in each block. */
export function estimateReadingTime(body: PortableTextBlock[]): string {
  const words = body
    .filter((b) => b._type === "block")
    .flatMap((b) => (b.children as { text?: string }[]) ?? [])
    .reduce((count, span) => count + (span.text?.split(/\s+/).filter(Boolean).length ?? 0), 0);
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
