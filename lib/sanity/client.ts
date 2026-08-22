import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId, isSanityConfigured } from "./env";

// Placeholder id keeps client construction valid before Sanity is configured;
// lib/posts.ts never calls .fetch() unless isSanityConfigured is true.
export const client = createClient({
  projectId: isSanityConfigured ? projectId : "placeholder",
  dataset,
  apiVersion,
  useCdn: true,
});
