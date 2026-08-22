/*
 * PLACEHOLDER POSTS — this module mirrors the shape of the Sanity `post`
 * schema so Phase 5 can swap the data source without touching the pages.
 * The second post from the build doc ("From Accountant to Media Buyer")
 * is intentionally NOT drafted — accountant story placement is pending
 * Shoaib's decision (Resume-only rule).
 */

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readingTime: string;
  body: string[];
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

export const posts: Post[] = [
  {
    slug: "reduce-meta-ads-cost-per-lead",
    title: "How to Reduce Meta Ads Cost Per Lead by 40% — A Media Buyer's Field Guide",
    excerpt:
      "Most CPL problems aren't budget problems. They're structure, creative, and tracking problems wearing a budget costume.",
    category: "Meta Ads",
    publishedAt: "2026-08-01",
    readingTime: "8 min read",
    body: [
      "Placeholder draft — the full post publishes through Sanity Studio in Phase 5. The outline below is the working skeleton.",
      "When a client tells me their cost per lead has crept up, the ad budget is almost never the culprit. In six years of audits, the same three leaks show up in nearly every account: campaign structure that fragments the learning data, creative that stopped being tested the day the account launched, and tracking that quietly undercounts the leads that do arrive.",
      "This field guide walks through the exact sequence I use to bring CPL down — structure consolidation first, then a creative testing matrix with honest kill criteria, then conversion-event hygiene so the algorithm optimizes toward the leads your sales team actually wants.",
    ],
  },
  {
    slug: "your-ads-arent-broken-your-tracking-is",
    title: "Your Ads Aren't Broken. Your Tracking Is.",
    excerpt:
      "Half the 'ads don't work' stories I audit turn out to be measurement stories. Here's how to tell which one yours is.",
    category: "Tracking",
    publishedAt: "2026-08-15",
    readingTime: "6 min read",
    body: [
      "Placeholder draft — the full post publishes through Sanity Studio in Phase 5. The outline below is the working skeleton.",
      "Before you kill a campaign, ask one question: do you trust the number that's telling you it failed? Pixel-only setups lose events to browsers and ad blockers every single day, and the campaigns spending in the right places often look worst in a broken report.",
      "This post covers the five-minute checks I run before touching any budget — event deduplication, Conversions API match quality, GA4 cross-checks against real revenue — and what each mismatch pattern usually means.",
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getPostsByCategory(category: string): Post[] {
  return posts.filter(
    (p) => p.category.toLowerCase().replace(/[^a-z0-9]+/g, "-") === category
  );
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
