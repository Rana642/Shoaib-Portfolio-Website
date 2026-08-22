import type { Metadata } from "next";

export const siteUrl = "https://adsbyshoaib.com";
export const siteName = "Ads by Shoaib";

/**
 * Builds title/description/canonical/openGraph/twitter for a page in one
 * call. `path` is root-relative ("/about") — resolved against the root
 * layout's `metadataBase` into absolute URLs for canonical, og:url, and
 * image src.
 */
export function pageMetadata({
  title,
  description,
  path,
  ogTitle,
  titleAbsolute,
}: {
  title: string;
  description: string;
  path: string;
  ogTitle?: string;
  /** Bypass the root layout's "%s — Ads by Shoaib" template — for the
   * homepage, whose title already IS the full brand statement. */
  titleAbsolute?: boolean;
}): Metadata {
  const displayTitle = ogTitle ?? title;
  const ogImage = `/api/og?title=${encodeURIComponent(displayTitle)}`;

  return {
    title: titleAbsolute ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: displayTitle,
      description,
      url: path,
      siteName,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: displayTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: displayTitle,
      description,
      images: [ogImage],
    },
  };
}
