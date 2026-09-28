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
    price: "PKR 5,000",
    delivery: "3 days",
    caseStudySlugs: [],
    related: { href: "/services/tracking-analytics", label: "Tracking & Analytics" },
  },
  {
    slug: "google-business-profile-setup",
    name: "Google Business Profile Setup",
    title: "Google Business Profile Setup, Verification and Optimization",
    description:
      "Google Business Profile setup, verification help, and local SEO optimization, plus fixes for claimed, duplicate, incorrect, or suspended profiles, following Google's guidelines.",
    eyebrow: "Google Business Profile setup",
    h1: "Google Business Profile setup, done right the first time",
    intro:
      "A Google Business Profile (Google My Business) set up, verified, and optimized for local search, or an existing profile fixed, so you show up properly on Google Search and Maps.",
    summary: "New or existing profile set up, verified, optimized, and problems fixed.",
    includes: [
      "New profile created, or your existing profile claimed",
      "Verification guided step by step (video, phone, or postcard, as Google asks)",
      "Ownership and manager access sorted, so the business owns its profile",
      "Local SEO optimization: categories, services, service areas, hours, and description",
      "Photos, logo, and cover added, with first posts and a review link",
      "Incorrect business information corrected and duplicate profiles reported",
      "Suspended or disabled profile reviewed and a reinstatement request prepared and submitted",
      "A short guide to managing the profile yourself",
    ],
    needFromYou: [
      "Business name, address, phone, and opening hours",
      "Proof you own or are authorized to represent the business",
      "Photos of your place, team, or work, and your logo",
      "Being available for Google's verification step",
    ],
    platformNote:
      "Google decides verification and reinstatement, and nobody can make either instant. I work only with legitimate businesses and within Google's guidelines, and make sure every request is complete and correct.",
    price: "PKR 15,000",
    delivery: "7 days",
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
    price: "PKR 15,000",
    delivery: "5 days",
    caseStudySlugs: [],
    related: { href: "/services/google-ads", label: "Google Ads management" },
  },
  {
    slug: "facebook-business-page-setup",
    name: "Facebook Business Page Setup",
    title: "Facebook Business Page Setup and Optimization Service",
    description:
      "Facebook business page setup and optimization: a professional page with cover design, launch posts and stories, automated replies, and your website linked.",
    eyebrow: "Business Facebook page setup",
    h1: "A Facebook business page that looks like a real business",
    intro:
      "Facebook business page setup done professionally: I create a Facebook page for your business, or redesign your existing page, optimized so people find it, and ready for customers, messages, and ads.",
    summary: "Page created or redesigned, branded, with launch posts and auto-replies.",
    includes: [
      "Facebook business page created, or your existing page redesigned",
      "Page name, category, username, about section, and keywords optimized for search",
      "Professional cover design and profile image, sized correctly",
      "4 designed launch posts and 4 stories",
      "Call-to-action button: call, WhatsApp, book, or shop",
      "Automated replies (instant reply, FAQs, away message) and a spam comment filter",
      "Website linked, with page insights and tracking set up",
      "Researched hashtags for your niche and a 30-day action plan",
    ],
    needFromYou: [
      "Your logo, or brand colours for me to work from",
      "Business details: what you sell, contact numbers, website",
      "A few photos of your products, place, or work for the launch posts",
      "Adding me as a page admin from your own profile (if the page exists)",
    ],
    price: "PKR 2,911.62",
    delivery: "3 days",
    caseStudySlugs: [],
    related: { href: "/services/meta-ads", label: "Meta Ads management" },
  },
  {
    slug: "instagram-business-account-setup",
    name: "Instagram Business Account Setup",
    title: "Instagram Business Account Setup and Optimization Service",
    description:
      "Instagram business account setup and optimization: business settings, contact buttons, custom profile picture, highlight covers, an optimized bio, hashtags, and insights turned on.",
    eyebrow: "Instagram business account setup",
    h1: "An Instagram business profile people trust at first glance",
    intro:
      "Instagram business account setup done properly: a new account created, or your existing one converted and optimized, so visitors understand what you do and how to reach you in seconds.",
    summary: "Business profile created or converted, designed, with bio, highlights, and insights.",
    includes: [
      "Instagram account created, or your existing account switched to a business profile",
      "Business settings: category, contact details, and call, text, or WhatsApp buttons",
      "Custom profile picture designed for the small circle",
      "Story highlight covers in your brand style",
      "Bio written and optimized with keywords and your website link",
      "Researched hashtags for your niche",
      "Insights and analytics settings turned on",
    ],
    needFromYou: [
      "Your logo, or brand colours for me to work from",
      "Business details: what you sell, contact numbers, website",
      "Login confirmation from your side if Instagram asks to verify the account",
    ],
    platformNote: "This setup doesn't include posting or ongoing management.",
    price: "PKR 2,911.62",
    delivery: "4 days",
    caseStudySlugs: [],
    related: { href: "/services/meta-ads", label: "Meta Ads management" },
  },
  {
    slug: "linkedin-business-page-setup",
    name: "LinkedIn Business Page Setup",
    title: "LinkedIn Company Page Creation and Setup Service",
    description:
      "LinkedIn business page setup and optimization: custom URL, banner and logo, a keyword-rich about section and specialties, CTA button, launch posts, and a growth plan.",
    eyebrow: "LinkedIn company page creation",
    h1: "A LinkedIn company page that wins trust before the first call",
    intro:
      "LinkedIn company page creation and business page setup done properly: a new page created, or your existing page redesigned, so clients, partners, and hires see a credible business when they look you up.",
    summary: "Company page created or redesigned, optimized, with launch posts and a growth plan.",
    includes: [
      "LinkedIn company page created, or your existing page redesigned",
      "Custom page URL (linkedin.com/company/your-name)",
      "Professional banner and logo sized for LinkedIn",
      "Tagline and about section optimized with keywords, plus up to 20 specialties",
      "Call-to-action button, with your website and other social profiles linked",
      "8 designed launch posts",
      "Researched hashtags for your industry",
      "Page analytics set up so you can see who visits and follows",
      "A simple content and follower growth plan",
    ],
    needFromYou: [
      "Your logo, or brand colours for me to work from",
      "Company details: what you do, industry, size, location, website",
      "Adding me as a page admin from your personal LinkedIn profile",
    ],
    price: "PKR 2,911.62",
    delivery: "3 days",
    caseStudySlugs: [],
    related: { href: "/services", label: "Paid ads and management" },
  },
  {
    slug: "tiktok-business-account-setup",
    name: "TikTok Business Account Setup",
    title: "TikTok Business Account Setup and Business Verification",
    description:
      "TikTok business account setup: an optimized business profile, TikTok Business Center and Ads Manager ready for ads, and company verification with your NTN or registration documents.",
    eyebrow: "TikTok business account setup",
    h1: "A TikTok business account that's ready to sell, not just post",
    intro:
      "TikTok business account setup done properly: a profile customers trust, a Business Center your business owns, an ad account ready to run, and company verification so your brand looks official.",
    summary: "Business profile, Business Center, ad account, and company verification.",
    includes: [
      "TikTok account created, or your existing account switched to a Business Account",
      "Profile optimized: name, username, bio, category, website link, and contact button",
      "Profile picture designed to read clearly at small size",
      "TikTok Business Center set up and owned by your business",
      "TikTok Ads Manager account created and linked, ready for your first campaign",
      "TikTok Pixel added to your website, if you plan to run ads",
      "Company verification in Business Center, when you provide your NTN certificate or business registration",
      "A short guide to posting and running ads from your new account",
    ],
    needFromYou: [
      "Your logo, or brand colours for me to work from",
      "Business details: what you sell, contact email and number, website",
      "Your NTN certificate or business registration document, for company verification",
      "Adding your own payment method inside TikTok Ads Manager",
    ],
    platformNote:
      "TikTok reviews every business verification and decides approval and timing. I make sure the documents and details match so the request is complete and correct.",
    price: "PKR 2,911.62",
    delivery: "3 days",
    caseStudySlugs: [],
    related: { href: "/services", label: "Paid ads and management" },
  },
  {
    slug: "youtube-channel-setup",
    name: "YouTube Channel Setup (Brand Account)",
    title: "YouTube Channel Setup for Business (Brand Account)",
    description:
      "YouTube channel setup for business: a Brand Account channel your business owns, custom handle, banner and profile design, keyword-rich description, playlists, and ads-ready linking.",
    eyebrow: "YouTube channel setup",
    h1: "A YouTube channel your business owns, ready to grow",
    intro:
      "YouTube channel setup for your company on a Brand Account, so the channel belongs to your business, not one person's Gmail, and is branded, organized, and ready for videos and ads.",
    summary: "Brand Account channel, branding, description, playlists, and ads-ready.",
    includes: [
      "Brand Account channel created, or your personal channel moved to one your business owns",
      "Channel name and custom handle (@yourbusiness)",
      "Banner, profile picture, and video watermark designed",
      "Channel description with keywords, contact email, website, and social links",
      "Channel trailer slot, sections, and playlist structure set up",
      "Phone verification for custom thumbnails and longer videos",
      "YouTube Studio defaults: upload settings, category, and tags",
      "Channel linked to Google Ads, ready for YouTube ads",
    ],
    needFromYou: [
      "Your logo, or brand colours for me to work from",
      "Business details: what you do, contact email, website, and social links",
      "The business Google account that will own the channel",
      "A phone number for YouTube's verification step",
    ],
    platformNote:
      "The verified badge (tick) is given by YouTube only after 100,000 subscribers, and monetization needs 1,000 subscribers and 4,000 watch hours, so neither is part of any setup.",
    price: "PKR 2,911.62",
    delivery: "3 days",
    caseStudySlugs: [],
    related: { href: "/services/google-ads", label: "Google and YouTube Ads" },
  },
  {
    slug: "landing-page-email-copywriting",
    name: "Landing Page + Email Sequence Copywriting",
    title: "Landing Page and Sales Funnel Copywriting Service",
    description:
      "Landing page copywriting for paid traffic: a sales page up to 1,100 words built around your offer and buyer, plus a 3-email follow-up sequence, with 2 revisions.",
    eyebrow: "Landing page copywriting",
    h1: "Landing page copy written for the people your ads bring in",
    intro:
      "Sales funnel copywriting from someone who runs the ads: a landing page that speaks to the buyer your ads target, and a short email sequence that follows up with the ones who don't buy yet.",
    summary: "Sales page copy up to 1,100 words plus a 3-email follow-up sequence.",
    includes: [
      "A short questionnaire and review of your offer, audience, and current ads",
      "Landing or sales page copy up to 1,100 words",
      "Headline, offer, benefits, proof, objections, and call to action in a clear order",
      "Copy matched to the ads that will send traffic to the page",
      "A 3-email follow-up sequence for people who don't buy on the first visit",
      "2 rounds of revisions",
      "Delivered in a Google Doc, ready for your designer or page builder",
    ],
    needFromYou: [
      "Your offer: what you sell, price, and what makes it different",
      "Who the buyer is, and the questions customers usually ask",
      "Any reviews, results, or numbers I can use as proof",
    ],
    platformNote: "This is copywriting only; page design and building are separate.",
    price: "PKR 15,000",
    delivery: "5 days",
    caseStudySlugs: [],
    related: { href: "/services/funnels-web", label: "Landing pages and funnels" },
  },
  {
    slug: "meta-business-manager-setup",
    name: "Meta Business Manager Setup",
    title: "Meta Business Manager Setup: Complete Business Suite, Pixel and Verification",
    description:
      "Complete Meta Business Manager setup: audit and fix of your existing setup or a new one built, ad account, Pixel and Conversions API, domain and business verification, Instagram and WhatsApp connected.",
    eyebrow: "Meta Business Manager setup",
    h1: "Your whole Meta setup, audited, fixed, and owned by your business",
    intro:
      "A complete Meta Business Manager (Business Suite) setup: I audit and fix what you already have, or build it new, so your page, Instagram, WhatsApp, ad account, and tracking all sit in one business account you own.",
    summary: "Audit and fix or new build: ad account, Pixel + CAPI, verification, Instagram and WhatsApp.",
    includes: [
      "Audit of your existing Business Manager: ownership, access, assets, and errors, with everything fixed",
      "New Business Manager (business portfolio) created if you don't have one, owned by your business",
      "Facebook page and Instagram account connected as business assets",
      "WhatsApp Business account connected",
      "Ad account created or recovered, with the right currency, time zone, and your payment method",
      "Meta Pixel installed with standard events, plus the Conversions API with deduplication",
      "Domain verified for your website",
      "Business verification submitted, when you provide your business documents",
      "People and partner roles set with the right permissions, and two-factor security on",
    ],
    needFromYou: [
      "The owner logging in with their own Facebook profile (I never ask for passwords)",
      "Admin access to your website or Google Tag Manager, for the Pixel and domain verification",
      "Business documents (such as your NTN certificate) if you want business verification",
      "Adding your own payment method to the ad account",
    ],
    platformNote:
      "Meta reviews business verification and decides approval and timing. I make sure the documents and details match so the request is complete and correct.",
    price: "PKR 15,000",
    delivery: "7 days",
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
    price: "PKR 5,000",
    delivery: "3 days",
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
    price: "PKR 5,000",
    delivery: "5 days",
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
    price: "PKR 15,000",
    delivery: "5 days",
    caseStudySlugs: [],
    related: { href: "/services/google-ads", label: "Google Ads management" },
  },
];

export const getSetup = (slug: string) => setups.find((s) => s.slug === slug) ?? null;

/** The price line shown on cards and pages. */
export const priceLabel = (s: Setup) => s.price ?? "Fixed price, confirmed before work starts";
/** Delivery is a typical figure; the actual timeline is agreed per deal. */
export const deliveryLabel = (s: Setup) =>
  s.delivery ? `Usually ${s.delivery}, confirmed per project` : "Timeline confirmed with the price";
