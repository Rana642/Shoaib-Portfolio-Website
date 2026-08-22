/*
 * Case-studies data layer. Sanity-first once documents exist there;
 * falls back to the placeholder MDX files in content/case-studies/ while
 * the Studio is empty (same graceful-migration pattern as lib/posts.ts).
 * Server-only (uses fs) — import from server components/route handlers.
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { PortableTextBlock } from "next-sanity";
import { sanityFetch } from "./sanity/client";
import { allCaseStudiesQuery, caseStudyBySlugQuery } from "./sanity/queries";

export type CaseStudyMeta = {
  slug: string;
  title: string;
  industry: string;
  client: string;
  excerpt: string;
  coverImage?: string;
  outcome: string;
  publishedAt: string;
};

/** Body is Portable Text when the study lives in Sanity, raw MDX otherwise. */
export type CaseStudyBody =
  | { source: "sanity"; blocks: PortableTextBlock[] }
  | { source: "mdx"; content: string };

export type CaseStudy = CaseStudyMeta & { body: CaseStudyBody };

const dir = path.join(process.cwd(), "content", "case-studies");

function getMdxCaseStudies(): CaseStudyMeta[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const { data } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      return { slug, ...(data as Omit<CaseStudyMeta, "slug">) };
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

function getMdxCaseStudy(slug: string): CaseStudy | null {
  const file = path.join(dir, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return {
    slug,
    ...(data as Omit<CaseStudyMeta, "slug">),
    body: { source: "mdx", content },
  };
}

export async function getAllCaseStudies(): Promise<CaseStudyMeta[]> {
  const fromSanity = await sanityFetch<CaseStudyMeta[]>(allCaseStudiesQuery);
  if (fromSanity && fromSanity.length > 0) return fromSanity;
  return getMdxCaseStudies();
}

export async function getCaseStudy(slug: string): Promise<CaseStudy | null> {
  const fromSanity = await sanityFetch<
    (CaseStudyMeta & { body?: PortableTextBlock[] }) | null
  >(caseStudyBySlugQuery, { slug });
  if (fromSanity) {
    return { ...fromSanity, body: { source: "sanity", blocks: fromSanity.body ?? [] } };
  }
  return getMdxCaseStudy(slug);
}
