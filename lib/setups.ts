/*
 * Single, fixed-scope setup services ("done-for-you" setups), each with its
 * own page at /setups/[slug]. Keyword demand checked in Google Ads Keyword
 * Planner (2026-09-28); pages target buyer phrasing ("... setup service")
 * rather than the DIY "how do I" searches.
 *
 * price / delivery are set by Shoaib. While null the pages say the price and
 * timeline are confirmed before work starts — never invent a number here.
 */
export type Setup = {
  slug: string;
  /** Short name used on cards, the order form and emails. */
  name: string;
  /** <title>, before the site-name suffix. */
  title: string;
  description: string;
  /** Tag above the H1 — the search phrase. */
  eyebrow: string;
  h1: string;
  intro: string;
  /** One line for the index card. */
  summary: string;
  includes: string[];
  needFromYou: string[];
  /** Shown as a plain note when the outcome depends on the platform. */
  platformNote?: string;
  /** e.g. "$99" — null until Shoaib sets it. */
  price: string | null;
  /** e.g. "2–3 working days" — null until Shoaib sets it. */
  delivery: string | null;
  caseStudySlugs: string[];
  related: { href: string; label: string };
};

export const setups: Setup[] = [
  {
    slug: "meta-pixel-conversions-api",
    name: "Meta Pixel + Conversions API setup",
    title: "Meta Pixel and Conversions API Setup Service",
    description:
      "Meta Pixel and Conversions API set up properly: standard events mapped to your site, server-side tracking with deduplication, tested in Events Manager.",
    eyebrow: "Meta pixel setup",
    h1: "Meta Pixel and Conversions API, set up properly",
    intro:
      "A Meta pixel setup that actually counts your leads and sales, plus the Conversions API so results don't go missing when browsers block the pixel.",
    summary: "Pixel and server-side tracking, with the events that matter to your ads.",
    includes: [
      "Meta Pixel installed through Google Tag Manager or your platform (Shopify, WordPress, WooCommerce)",
      "Standard events mapped to your site: leads, add to cart, checkout, purchase",
      "Conversions API (server-side) with deduplication, so nothing is counted twice",
      "Domain verified in your Meta business account",
      "Every event tested in Events Manager, with a short handover note",
    ],
    needFromYou: [
      "Admin access to your website or Google Tag Manager",
      "Partner access to your Meta business account",
      "The actions that count as a result for you (form, call, purchase)",
    ],
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
  },
  {
    slug: "google-business-profile-setup",
    name: "Google Business Profile setup",
    title: "Google Business Profile Setup and Verification Service",
    description:
      "Google Business Profile setup and verification: a complete, accurate profile with the right categories, services, hours, photos, and your first posts.",
    eyebrow: "Google Business Profile setup",
    h1: "Google Business Profile setup, done right the first time",
    intro:
      "A Google Business Profile (Google My Business) set up completely, so you show up properly on Google Search and Maps from day one.",
    summary: "A complete, verified-ready profile for Google Search and Maps.",
    includes: [
      "Profile created or claimed for your business",
      "Verification started and guided step by step (video or postcard, as Google asks)",
      "Primary and secondary categories, services, hours, and service areas",
      "Description, photos, logo, and cover set up",
      "First posts published and a review link you can share",
    ],
    needFromYou: [
      "Business name, address, phone, and opening hours",
      "Photos of your place, team, or work, and your logo",
      "Being available for Google's verification step",
    ],
    platformNote:
      "Google decides the verification method and timing. I handle everything on our side and walk you through it.",
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/google-business-profile-management", label: "Google Business Profile management" },
  },
  {
    slug: "google-ads-account-setup",
    name: "Google Ads account setup",
    title: "Google Ads Account Setup with Conversion Tracking",
    description:
      "Google Ads account setup with conversion tracking, keyword research, and a first Search campaign built properly, so spend goes to buyers from day one.",
    eyebrow: "Google Ads account setup",
    h1: "A Google Ads account set up to spend on buyers",
    intro:
      "Google Ads account setup with conversion tracking in place before a single click is paid for, and a first campaign built on real keyword research.",
    summary: "Account, conversion tracking, and a first campaign built properly.",
    includes: [
      "Account created with the right currency, time zone, and settings",
      "Conversion tracking for leads, calls, or purchases",
      "Keyword research and a negative keyword list",
      "First Search campaign with ad groups and ads written for your offer",
      "Linked to GA4 and your Google Business Profile",
    ],
    needFromYou: [
      "A business Google account (Gmail) to own the ads account",
      "Adding your own billing card inside Google Ads",
      "Admin access to your website or Google Tag Manager",
    ],
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/services/google-ads", label: "Google Ads management" },
  },
  {
    slug: "facebook-instagram-business-setup",
    name: "Facebook page + Instagram business setup",
    title: "Facebook Business Page and Instagram Business Account Setup",
    description:
      "Facebook business page setup and Instagram business account setup: the right category, username, contact buttons, visuals, and both accounts linked.",
    eyebrow: "Business Facebook page setup",
    h1: "A Facebook page and Instagram account that look like a real business",
    intro:
      "Business Facebook page setup and Instagram business account setup, linked together and ready for customers and ads.",
    summary: "Page and Instagram created, branded, and linked for ads.",
    includes: [
      "Facebook business page with the right category, username, and about section",
      "Contact details and a call-to-action button (call, WhatsApp, or book)",
      "Profile picture and cover sized correctly",
      "Instagram professional account set up and linked to the page",
      "Inbox and basic automatic replies turned on",
    ],
    needFromYou: [
      "Your logo and a cover image, or brand colours for me to work from",
      "Business details: what you sell, contact numbers, website",
      "Adding me as a page admin from your own profile",
    ],
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/services/meta-ads", label: "Meta Ads management" },
  },
  {
    slug: "meta-business-suite-setup",
    name: "Meta Business Suite setup",
    title: "Meta Business Suite and Business Manager Setup Service",
    description:
      "Meta Business Suite and Business Manager setup: a business portfolio you own, with page, Instagram, ad account, pixel, and WhatsApp added and secured.",
    eyebrow: "Meta Business Suite setup",
    h1: "A Meta Business Suite you own, organised and secure",
    intro:
      "Meta Business Suite and Business Manager set up so your business, not a person or an old agency, owns the page, Instagram, ad account, and pixel.",
    summary: "Business portfolio, assets, roles, and security in order.",
    includes: [
      "Business portfolio created and owned by you",
      "Page, Instagram, ad account, pixel, and WhatsApp added as assets",
      "People and partner roles set with the right permissions",
      "Domain verification and two-factor security",
      "A short guide to what's where, for your team",
    ],
    needFromYou: [
      "The owner logging in with their own Facebook profile (I never ask for passwords)",
      "Adding your own payment method to the ad account",
      "Business documents, if Meta asks for business verification",
    ],
    price: null,
    delivery: null,
    caseStudySlugs: ["avenza-avenue"],
    related: { href: "/services/meta-ads", label: "Meta Ads management" },
  },
  {
    slug: "ga4-google-tag-manager-setup",
    name: "GA4 + Google Tag Manager setup",
    title: "GA4 and Google Tag Manager Setup Service",
    description:
      "GA4 setup and Google Tag Manager setup: key events for forms, calls, WhatsApp clicks, and purchases, linked to Google Ads and Search Console.",
    eyebrow: "GA4 and Google Tag Manager setup",
    h1: "GA4 and Tag Manager that track what actually matters",
    intro:
      "GA4 setup through Google Tag Manager, with the events that show where leads and sales really come from, not just page views.",
    summary: "Clean analytics with the events your business runs on.",
    includes: [
      "Google Tag Manager container installed on your site",
      "GA4 property and data stream set up",
      "Key events: forms, calls, WhatsApp clicks, and purchases",
      "Ecommerce events for online stores",
      "GA4 linked to Google Ads and Search Console",
    ],
    needFromYou: [
      "Admin access to your website",
      "Access to any existing Google Analytics or Tag Manager account",
      "The actions that count as a result for you",
    ],
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
  },
  {
    slug: "meta-verified-business",
    name: "Meta Verified for business",
    title: "Meta Verified for Business Setup (Blue Tick)",
    description:
      "Meta Verified for business: eligibility checked, business verification prepared, and the Meta Verified application handled for your Facebook and Instagram.",
    eyebrow: "Meta verified business",
    h1: "The Meta Verified badge, applied for the right way",
    intro:
      "Help getting Meta Verified for business (the blue tick): I check eligibility, prepare your business verification, and handle the application.",
    summary: "Eligibility, business verification, and the application handled.",
    includes: [
      "Eligibility check for your page and Instagram",
      "Business verification prepared in your Meta business account",
      "Profile details brought in line with your documents",
      "Meta Verified application submitted and followed up",
    ],
    needFromYou: [
      "Business documents that match your page details",
      "The owner logging in to confirm steps Meta asks for",
      "Meta's own subscription fee, paid directly to Meta",
    ],
    platformNote:
      "Meta decides who gets verified. I can't guarantee approval, but I make sure the application is complete and correct.",
    price: null,
    delivery: null,
    caseStudySlugs: ["avenza-avenue"],
    related: { href: "/services/meta-ads", label: "Meta Ads management" },
  },
  {
    slug: "google-merchant-center-setup",
    name: "Google Merchant Center setup",
    title: "Google Merchant Center Setup Service",
    description:
      "Google Merchant Center setup: business info, shipping and returns, website verified, product feed connected, and linked to Google Ads for Shopping.",
    eyebrow: "Google Merchant Center setup",
    h1: "Google Merchant Center, ready for Shopping ads",
    intro:
      "Google Merchant Center setup for online stores, so your products can show in Google Shopping and Performance Max.",
    summary: "Store verified, product feed live, linked to Google Ads.",
    includes: [
      "Merchant Center account with business details",
      "Shipping and returns policies set up",
      "Website verified and claimed",
      "Product feed connected (Shopify, WooCommerce, or a feed file)",
      "Linked to Google Ads, with launch-time disapprovals fixed",
    ],
    needFromYou: [
      "Admin access to your store",
      "Your shipping and returns policy pages",
      "A Google account to own the Merchant Center",
    ],
    platformNote: "Google reviews every store and product. I fix what they flag at launch.",
    price: null,
    delivery: null,
    caseStudySlugs: [],
    related: { href: "/services/google-ads", label: "Google Ads management" },
  },
];

export const getSetup = (slug: string) => setups.find((s) => s.slug === slug) ?? null;

/** The price line shown on cards and pages. */
export const priceLabel = (s: Setup) => s.price ?? "Fixed price, confirmed before work starts";
export const deliveryLabel = (s: Setup) => s.delivery ?? "Timeline confirmed with the price";
