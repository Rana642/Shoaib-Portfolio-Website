/*
 * Problem-first "Solutions" pages. Each page targets the words a frustrated
 * business owner actually searches (keyword ideas checked in Google Ads
 * Keyword Planner, 2026-09-28), diagnoses why it happens, shows the fix
 * built from the services, and — only where a real case study fits — proof.
 * Case studies are referenced by Sanity slug; missing/inactive ones are
 * skipped, and the proof block hides when none remain.
 */
export type Solution = {
  slug: string;
  /** Title tag, before the site-name suffix. */
  title: string;
  description: string;
  /** Short tag above the H1 — the search phrase. */
  eyebrow: string;
  h1: string;
  intro: string;
  /** Card title on the index page and in links. */
  problem: string;
  causes: { title: string; description: string }[];
  fixes: { title: string; description: string }[];
  /** Service pages the fixes lean on. */
  services: { href: string; label: string }[];
  caseStudySlugs: string[];
};

export const solutions: Solution[] = [
  {
    slug: "facebook-ads-not-working",
    title: "Facebook Ads Not Working? Why You Get No Leads or Sales",
    description:
      "Facebook and Meta ads running but not bringing leads or sales? The usual causes, and how I fix them: objective, tracking, creative testing, and offer.",
    eyebrow: "Facebook ads not working",
    h1: "Facebook ads running, but no leads or sales?",
    intro:
      "The ads are live and the budget is gone, but the phone stays quiet. It's almost never the platform. It's how the account is set up.",
    problem: "Ads run. Leads don't come.",
    causes: [
      {
        title: "Wrong objective",
        description: "The campaign is told to find clicks or engagement, so Meta finds people who click, not people who buy.",
      },
      {
        title: "Blind optimisation",
        description: "The pixel or Conversions API isn't sending the right events, so Meta can't learn who your buyers are.",
      },
      {
        title: "Creative that was never tested",
        description: "One or two ads rotated for weeks. No hooks, angles, or formats compared, so nobody knows what works.",
      },
      {
        title: "Ad and offer don't match",
        description: "The ad promises one thing and the page or form asks for another, so interested people drop off.",
      },
    ],
    fixes: [
      { title: "Audit", description: "Account structure, objective, tracking, and creative, checked in one pass." },
      { title: "Rebuild around one goal", description: "Campaigns optimised for leads or purchases, on clean conversion data." },
      { title: "Test creative properly", description: "Hooks, angles, and formats tested side by side, winners kept." },
      { title: "Scale what works", description: "Weekly decisions: budget moves to the ads that bring customers." },
    ],
    services: [
      { href: "/services/meta-ads", label: "Meta Ads" },
      { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
    ],
    caseStudySlugs: ["dha-real-estate", "hotel-avalon-suites"],
  },
  {
    slug: "google-ads-no-conversions",
    title: "Google Ads No Conversions? Why Clicks Don't Turn Into Sales",
    description:
      "Google Ads getting clicks but no conversions? Check tracking, search terms, Performance Max signals, and landing pages. Here's how I fix each one.",
    eyebrow: "Google Ads no conversions",
    h1: "Google Ads getting clicks, but no conversions?",
    intro:
      "Search traffic is the warmest traffic you can buy. When it doesn't convert, the leak is usually in a few predictable places.",
    problem: "Clicks come. Conversions don't.",
    causes: [
      {
        title: "Tracking counts the wrong thing",
        description: "Conversions aren't firing, fire twice, or count page views, so bidding chases the wrong result.",
      },
      {
        title: "Searches you never wanted",
        description: "Broad match without negative keywords spends on searches that were never going to buy.",
      },
      {
        title: "Performance Max without signals",
        description: "PMax is given no good data or audience signals, so it spends where results are cheapest, not best.",
      },
      {
        title: "Landing page mismatch",
        description: "The search asks for one thing, the page talks about another, and the visitor leaves.",
      },
    ],
    fixes: [
      { title: "Fix tracking first", description: "Only real leads and sales counted as conversions." },
      { title: "Clean the search terms", description: "Negative keywords added and reviewed every week." },
      { title: "Restructure campaigns", description: "Search and Performance Max run as one system with clear roles." },
      { title: "Match the page to the search", description: "Landing pages that answer exactly what people searched for." },
    ],
    services: [
      { href: "/services/google-ads", label: "Google & YouTube Ads" },
      { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
      { href: "/services/funnels-web", label: "Funnels & Web" },
    ],
    caseStudySlugs: [],
  },
  {
    slug: "low-quality-leads",
    title: "Low Quality Leads From Ads? How to Get Leads That Buy",
    description:
      "Getting leads from ads that never answer or never buy? Why low-quality leads happen, and how I fix the form, the targeting signal, and the follow-up.",
    eyebrow: "Low quality leads",
    h1: "Leads come in. None of them buy?",
    intro:
      "Cheap leads look good in a report and cost you time on the phone. The fix is to ask the ad platform for better people, not more of them.",
    problem: "Leads come. None of them buy.",
    causes: [
      {
        title: "The form is too easy",
        description: "One tap, no questions. Anyone can submit, including people who never meant to buy.",
      },
      {
        title: "Optimised for cheap, not qualified",
        description: "The platform is rewarded for the lowest cost per lead, so it finds the least serious people.",
      },
      {
        title: "Slow follow-up",
        description: "Leads wait hours or days for a call, and by then they've moved on.",
      },
      {
        title: "No feedback to the platform",
        description: "Meta and Google never learn which leads became customers, so they can't find more like them.",
      },
    ],
    fixes: [
      { title: "Qualify in the form", description: "A few smart questions that filter out people who won't buy." },
      { title: "Send back the good leads", description: "Qualified leads and sales reported back, so ads find more of them." },
      { title: "Faster follow-up", description: "WhatsApp and instant replies, so leads are contacted while they're warm." },
      { title: "Pages that pre-sell", description: "Landing pages that explain the offer before someone fills the form." },
    ],
    services: [
      { href: "/services/meta-ads", label: "Meta Ads" },
      { href: "/services/funnels-web", label: "Funnels & Web" },
      { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
    ],
    caseStudySlugs: ["dha-real-estate", "boutique-hotel-multan"],
  },
  {
    slug: "conversion-tracking-not-working",
    title: "Conversion Tracking Not Working? Pixel, CAPI and GA4 Fixed",
    description:
      "Can't tell which ad brought the sale? Facebook pixel not working, Google Ads not showing conversions? How I rebuild tracking with GTM, CAPI, and GA4.",
    eyebrow: "Conversion tracking not working",
    h1: "Can't tell which ad actually made the sale?",
    intro:
      "Without tracking you can trust, every budget decision is a guess. Fixing it is usually the fastest way to stop wasting spend.",
    problem: "You can't tell which ad actually works.",
    causes: [
      {
        title: "Pixel installed, events wrong",
        description: "Events are missing, duplicated, or named differently on every page.",
      },
      {
        title: "Browsers block the pixel",
        description: "Without the Conversions API and enhanced conversions, a large share of results never reaches the platform.",
      },
      {
        title: "WhatsApp and calls aren't counted",
        description: "Many customers book on WhatsApp or by phone, and none of it shows up in the ads account.",
      },
      {
        title: "Tools don't agree",
        description: "Meta, Google, and GA4 each report a different number, so nobody trusts any of them.",
      },
    ],
    fixes: [
      { title: "Tracking audit", description: "Every event checked on your site, forms, and checkout." },
      { title: "Rebuild in Tag Manager", description: "One clean setup for GA4, Meta, and Google Ads." },
      { title: "Server-side signals", description: "Conversions API and enhanced conversions, so results stop going missing." },
      { title: "Count offline results", description: "WhatsApp chats, calls, and bookings tied back to the ad that caused them." },
    ],
    services: [{ href: "/services/tracking-analytics", label: "Tracking & Analytics" }],
    caseStudySlugs: [],
  },
];

export const getSolution = (slug: string) => solutions.find((s) => s.slug === slug) ?? null;
