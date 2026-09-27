/*
 * Search-facing layer for the service pages: the keyword each page targets
 * (title tag, eyebrow) and a problem-led H1. Lives in code, not Sanity, so
 * the Studio's service copy (tagline, description, deliverables) stays the
 * editable body while the SEO framing is versioned with the templates.
 * Slugs missing here fall back to the Sanity title/summary.
 */
export type ServiceSeo = {
  /** <title>, before the site-name suffix. Leads with the target keyword. */
  title: string;
  description: string;
  /** Small tag above the H1 — the keyword, as a searcher would type it. */
  eyebrow: string;
  /** Problem-led headline that still carries the keyword. */
  h1: string;
};

export const serviceSeo: Record<string, ServiceSeo> = {
  "meta-ads": {
    title: "Meta Ads Expert for Facebook and Instagram Ads",
    description:
      "Meta ads expert for leads and sales. I restructure Facebook and Instagram ad accounts, test creative properly, and scale what brings customers.",
    eyebrow: "Meta ads expert",
    h1: "Meta ads that turn scrollers into customers",
  },
  "google-ads": {
    title: "Google Ads Consultant for Search, Performance Max and YouTube",
    description:
      "Google Ads consultant for businesses that want buyers, not clicks. Search, Performance Max, and YouTube run as one system on clean conversion data.",
    eyebrow: "Google Ads consultant",
    h1: "Google Ads that reach buyers the moment they search",
  },
  "tracking-analytics": {
    title: "Conversion Tracking Setup: GA4, Meta CAPI and Tag Manager",
    description:
      "Conversion tracking set up properly: GA4, Google Tag Manager, Meta Pixel and Conversions API, so every ad is judged on sales, not guesses.",
    eyebrow: "Conversion tracking and analytics",
    h1: "Tracking that shows which ad actually made the sale",
  },
  "funnels-web": {
    title: "Landing Pages and Funnels That Convert Paid Traffic",
    description:
      "Landing pages and funnels built for paid traffic: one offer, one action, and pages that turn ad clicks into leads and bookings.",
    eyebrow: "Landing pages and funnels",
    h1: "Landing pages that turn paid clicks into leads",
  },
};
