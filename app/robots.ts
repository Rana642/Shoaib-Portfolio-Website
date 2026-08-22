import type { MetadataRoute } from "next";
import { siteUrl, SITE_IS_LIVE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Pre-launch: block crawling entirely (on top of per-page noindex in
  // lib/seo.ts) so nothing gets indexed before Shoaib confirms the site
  // is final. Flip SITE_IS_LIVE in lib/seo.ts, not this file.
  if (!SITE_IS_LIVE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/api"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
