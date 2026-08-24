/*
 * Case-studies data layer. Sanity is the sole source — the local MDX
 * fallback was removed (2026-08-24) since content/case-studies/ has been
 * empty since the real case studies were migrated into Sanity, and the
 * migration script guarantees Sanity stays populated. Use the caseStudy
 * schema's `active` toggle in the Studio to hide one without deleting it.
 */
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

export type CaseStudy = CaseStudyMeta & { body: PortableTextBlock[] };

export async function getAllCaseStudies(): Promise<CaseStudyMeta[]> {
  return (await sanityFetch<CaseStudyMeta[]>(allCaseStudiesQuery)) ?? [];
}

export async function getCaseStudy(slug: string): Promise<CaseStudy | null> {
  const cs = await sanityFetch<(CaseStudyMeta & { body?: PortableTextBlock[] }) | null>(
    caseStudyBySlugQuery,
    { slug }
  );
  if (!cs) return null;
  return { ...cs, body: cs.body ?? [] };
}
