import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
import { getServices } from "@/lib/services";
import { getAllCaseStudies } from "@/lib/case-studies";
import { getAllPosts, categories, categorySlug } from "@/lib/posts";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = [
    "",
    "/services",
    "/about",
    "/case-studies",
    "/blog",
    "/shoaib-nabi-noor",
    "/hostinger-coupon",
    "/contact",
    "/privacy",
    "/terms",
  ];
  const staticEntries = staticPaths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  const services = await getServices();
  const serviceEntries = services.map((s) => ({
    url: `${siteUrl}/services/${s.slug}`,
    lastModified: new Date(),
  }));

  const caseStudies = await getAllCaseStudies();
  const caseStudyEntries = caseStudies.map((cs) => ({
    url: `${siteUrl}/case-studies/${cs.slug}`,
    lastModified: new Date(cs.publishedAt),
  }));

  const posts = await getAllPosts();
  const postEntries = posts.map((p) => ({
    url: `${siteUrl}/blog/${p.slug}`,
    lastModified: new Date(p.publishedAt),
  }));

  const categoryEntries = categories.map((c) => ({
    url: `${siteUrl}/blog/category/${categorySlug(c)}`,
    lastModified: new Date(),
  }));

  return [...staticEntries, ...serviceEntries, ...caseStudyEntries, ...postEntries, ...categoryEntries];
}
