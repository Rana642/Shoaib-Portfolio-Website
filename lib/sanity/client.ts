import { createClient, type QueryParams } from "next-sanity";
import { apiVersion, dataset, projectId, isSanityConfigured } from "./env";

// Placeholder id keeps client construction valid before Sanity is configured;
// data-layer modules never call .fetch() unless isSanityConfigured is true.
export const client = createClient({
  projectId: isSanityConfigured ? projectId : "placeholder",
  dataset,
  apiVersion,
  useCdn: true,
});

/**
 * Content fetch with a 1-hour ISR window. This is a low-traffic portfolio
 * site with occasional Studio edits, not a news feed — 60s (the original
 * value) meant almost every real visit could trigger a background
 * regeneration, i.e. a fresh Vercel function invocation *and* a fresh
 * Sanity API read, on nearly every request. An hour keeps both usage-based
 * quotas from being burned on redundant rebuilds of unchanged content
 * while still keeping edits reasonably fresh. Returns null when Sanity
 * isn't configured OR when the query errors — callers treat null/empty as
 * "use the local fallback data", which is how the site keeps working
 * while the Studio is still empty mid-migration.
 */
export async function sanityFetch<T>(query: string, params: QueryParams = {}): Promise<T | null> {
  if (!isSanityConfigured) return null;
  try {
    return await client.fetch<T>(query, params, { next: { revalidate: 3600 } });
  } catch (error) {
    console.error("[sanity] fetch failed:", error);
    return null;
  }
}
