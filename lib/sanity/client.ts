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
 * Content fetch with a 60s ISR window, so Studio edits appear on the site
 * within a minute without a redeploy. Returns null when Sanity isn't
 * configured OR when the query errors — callers treat null/empty as
 * "use the local fallback data", which is how the site keeps working
 * while the Studio is still empty mid-migration.
 */
export async function sanityFetch<T>(query: string, params: QueryParams = {}): Promise<T | null> {
  if (!isSanityConfigured) return null;
  try {
    return await client.fetch<T>(query, params, { next: { revalidate: 60 } });
  } catch (error) {
    console.error("[sanity] fetch failed:", error);
    return null;
  }
}
