# CLAUDE CODE INSTRUCTIONS — adsbyshoaib.com
## Complete Build Guide for Personal Brand Website

---

## PROJECT OVERVIEW

**Project name:** `adsbyshoaib`
**Owner:** Shoaib Nabi Noor
**Domain:** adsbyshoaib.com
**Type:** Personal brand website (performance marketing specialist)
**Positioning:** Fully equal hybrid — jobs / retainer clients / project clients (all doors open, solo status downplayed)

---

## TECH STACK (Non-negotiable)

- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **UI Components:** Custom-built + shadcn/ui base primitives
- **Animations:** Framer Motion + GSAP (for text splitting)
- **Smooth Scroll:** Lenis.js
- **3D Elements:** Spline (embedded) — for hero orb/scene later
- **CMS (Blog):** Sanity CMS
- **Hosting:** Vercel
- **Database:** Supabase (contact form submissions, newsletter signups)
- **Email:** Resend (transactional)
- **Analytics:** Google Analytics 4 + Vercel Analytics
- **Tracking:** Google Tag Manager + Meta Pixel + Meta Conversion API
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React (minimal set)
- **Fonts:** Instrument Serif (Google Fonts) + Geist + Geist Mono (via `next/font`)

---

## DESIGN SYSTEM (Locked)

### Colors

```ts
// tailwind.config.ts colors extension
colors: {
  cloud: '#FAFAFA',       // 65% — background
  ink: '#0F0F14',         // 25% — text
  cobalt: '#1E40AF',      // 8% — brand accent
  citrus: '#EAB308',      // 2% — highlight
  // Semantic
  'ink-muted': 'rgba(15, 15, 20, 0.75)',
  'ink-subtle': 'rgba(15, 15, 20, 0.5)',
  'ink-faint': 'rgba(15, 15, 20, 0.1)',
}
```

### Typography

```ts
// tailwind.config.ts fontFamily
fontFamily: {
  serif: ['var(--font-instrument-serif)', 'Georgia', 'serif'],
  sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
  mono: ['var(--font-geist-mono)', 'monospace'],
}

// Font sizes (in tailwind config extend)
fontSize: {
  'hero': ['clamp(2.5rem, 6vw, 4.5rem)', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
  'h2': ['clamp(2rem, 4vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
  'h3': ['clamp(1.5rem, 2.5vw, 2rem)', { lineHeight: '1.2' }],
  'body-lg': ['1.125rem', { lineHeight: '1.6' }],
  'body': ['1rem', { lineHeight: '1.6' }],
  'small': ['0.875rem', { lineHeight: '1.5' }],
  'tag': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.15em' }],
}
```

### Spacing (Tailwind default is fine — use 4, 8, 16, 24, 32, 48, 64, 96, 128px scale)

### Component Base Styles

```tsx
// Button variants
- primary: bg-ink text-cloud rounded-lg px-6 py-3.5 text-sm font-medium hover:-translate-y-0.5 hover:shadow-xl transition-all
- secondary: bg-transparent text-cobalt border border-cobalt rounded-lg px-6 py-3.5 text-sm font-medium hover:bg-cobalt hover:text-cloud transition-all
- ghost: text-cobalt hover:underline underline-offset-4

// Cards
- default: bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-6

// Tags/pills
- font-mono uppercase text-tag tracking-widest text-cobalt
```

---

## PROJECT STRUCTURE

```
adsbyshoaib/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx                          # Home
│   │   ├── services/
│   │   │   ├── page.tsx
│   │   │   └── [service]/page.tsx            # Individual service pages
│   │   ├── about/page.tsx
│   │   ├── case-studies/
│   │   │   ├── page.tsx
│   │   │   └── [slug]/page.tsx
│   │   ├── blog/
│   │   │   ├── page.tsx
│   │   │   ├── [slug]/page.tsx
│   │   │   └── category/[category]/page.tsx
│   │   ├── shoaib-nabi-noor/page.tsx         # Resume
│   │   └── contact/page.tsx
│   ├── api/
│   │   ├── contact/route.ts
│   │   ├── newsletter/route.ts
│   │   └── og/route.tsx                      # Dynamic OG images
│   ├── layout.tsx
│   ├── sitemap.ts
│   ├── robots.ts
│   └── globals.css
├── components/
│   ├── layout/
│   │   ├── Nav.tsx
│   │   ├── Footer.tsx
│   │   └── PageWrapper.tsx
│   ├── sections/
│   │   ├── Hero.tsx
│   │   ├── PainPoints.tsx
│   │   ├── Turn.tsx
│   │   ├── ServicesOverview.tsx
│   │   ├── WhyChooseUs.tsx
│   │   ├── AboutMini.tsx
│   │   ├── CaseStudiesPreview.tsx
│   │   ├── Philosophy.tsx
│   │   ├── Testimonials.tsx
│   │   ├── FAQ.tsx
│   │   ├── FinalCTA.tsx
│   │   └── TrustSignals.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Tag.tsx
│   │   ├── Container.tsx
│   │   └── AnimatedText.tsx
│   ├── shared/
│   │   ├── SmoothScroll.tsx
│   │   ├── AmbientBackground.tsx
│   │   └── SEO.tsx
│   └── forms/
│       ├── ContactForm.tsx
│       └── NewsletterForm.tsx
├── content/
│   ├── case-studies/                         # MDX files
│   ├── services/
│   └── posts/                                # (Blog syncs from Sanity, this is fallback)
├── lib/
│   ├── sanity.ts
│   ├── supabase.ts
│   ├── resend.ts
│   ├── analytics.ts
│   └── utils.ts
├── types/
├── public/
│   ├── images/
│   ├── fonts/
│   └── icons/
├── sanity/                                   # Sanity Studio (embedded)
│   ├── schemas/
│   └── config.ts
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## STEP-BY-STEP BUILD ORDER

### PHASE 1: Foundation Setup (Day 1)

**Task 1.1: Initialize Project**

```bash
npx create-next-app@latest adsbyshoaib --typescript --tailwind --app --src-dir=false --import-alias="@/*"
cd adsbyshoaib
```

**Task 1.2: Install Dependencies**

```bash
# Core
npm install framer-motion gsap lenis clsx tailwind-merge

# Forms & Validation
npm install react-hook-form zod @hookform/resolvers

# Icons
npm install lucide-react

# Sanity CMS
npm install @sanity/client @sanity/image-url next-sanity sanity @sanity/vision

# Database & Email
npm install @supabase/supabase-js resend

# Analytics
npm install @vercel/analytics

# MDX (for case studies)
npm install @next/mdx @mdx-js/loader @mdx-js/react

# Dev
npm install -D @types/node
```

**Task 1.3: Setup Fonts**

Create `app/fonts.ts`:

```ts
import { Instrument_Serif, Geist, Geist_Mono } from 'next/font/google'

export const instrumentSerif = Instrument_Serif({
  weight: ['400'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})
```

Apply in `app/layout.tsx` root `<html>` className.

**Task 1.4: Configure Tailwind**

Update `tailwind.config.ts` with colors, fonts, spacing from Design System section above.

**Task 1.5: Global CSS**

`app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    scroll-behavior: smooth;
  }
  body {
    @apply bg-cloud text-ink font-sans;
  }
  ::selection {
    @apply bg-cobalt text-cloud;
  }
}

@layer utilities {
  .container-narrow {
    @apply max-w-5xl mx-auto px-6 md:px-12;
  }
  .container-wide {
    @apply max-w-7xl mx-auto px-6 md:px-12;
  }
  .noise-overlay::before {
    content: '';
    @apply fixed inset-0 pointer-events-none opacity-[0.03] z-[1];
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
  }
}
```

**Task 1.6: Environment Variables**

`.env.local`:

```
# Sanity
NEXT_PUBLIC_SANITY_PROJECT_ID=
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@adsbyshoaib.com
RESEND_TO_EMAIL=shoaib.nabi.noor@gmail.com

# Analytics
NEXT_PUBLIC_GA_ID=G-XXXXXXX
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
NEXT_PUBLIC_META_PIXEL_ID=
META_CONVERSION_API_TOKEN=

# Calendly (or Cal.com)
NEXT_PUBLIC_CALENDLY_URL=
```

---

### PHASE 2: Core Layout & Components (Day 2-3)

**Task 2.1: Create Layout Components**

- `components/layout/Nav.tsx` — Sticky nav with logo, links, CTA button, mobile hamburger
- `components/layout/Footer.tsx` — 4-column footer (brand, links, legal, social + newsletter)
- `components/layout/PageWrapper.tsx` — Wraps every page with padding, container

**Task 2.2: UI Primitives**

- `components/ui/Button.tsx` — Variants: primary, secondary, ghost, with arrow icon support
- `components/ui/Card.tsx` — Base card with hover states
- `components/ui/Tag.tsx` — Mono uppercase pill
- `components/ui/Container.tsx` — Narrow, wide, full variants
- `components/ui/AnimatedText.tsx` — GSAP-powered text reveal (character-by-character on scroll)

**Task 2.3: Global Layout Elements**

- `components/shared/SmoothScroll.tsx` — Lenis wrapper, provides smooth scroll to entire app
- `components/shared/AmbientBackground.tsx` — Fixed blurred blobs (Cobalt + Citrus) that float in background

Apply in `app/layout.tsx`.

---

### PHASE 3: Home Page (Day 4-6)

**Task 3.1: Hero Section (`components/sections/Hero.tsx`)**

**Structure:**
- Left column (60% desktop, full width mobile): Text content
  - Brand tag: "ADS BY SHOAIB · PERFORMANCE MARKETING" (mono, uppercase, Cobalt)
  - Headline: "The marketing engine, fully assembled." (Instrument Serif italic, hero size)
  - "fully assembled" in Cobalt, period in Citrus
  - Sub: Independent practice paragraph
  - Two CTAs: "See the results →" (primary), "Get a free audit →" (secondary)
  - Stats row: $2.5M+ / 6+ yrs / 8 industries

- Right column (40% desktop, hidden or top on mobile — Shoaib's decision): Just a clean image
  - Aspect ratio: 4/5
  - Rounded corners (rounded-2xl)
  - Subtle 3D tilt animation (rotateY -2deg to 2deg, 8s loop)
  - Deep shadow (Cobalt-tinted)
  - Placeholder ready for real headshot

**Animations:**
- Text elements stagger fade-up (200ms delay each)
- Image fades in with subtle scale
- On scroll: parallax effect on image

**Text Content (final, do not modify):**

```tsx
<span className="brand-tag">Ads by Shoaib · Performance Marketing</span>
<h1 className="headline">
  The marketing engine, <span className="text-cobalt">fully assembled<span className="text-citrus">.</span></span>
</h1>
<p className="sub">
  Independent performance marketing practice led by <strong>Shoaib Nabi Noor</strong> —
  turning strategy, targeting, and creative into leads, bookings, and sales
  across <strong>Meta, Google, YouTube, and TikTok</strong>.
</p>
```

**Task 3.2: Pain Points Section (`components/sections/PainPoints.tsx`)**

Full copy from master plan — implement with GSAP text splitting for animated reveal per line on scroll.

**Task 3.3: Turn Section (`components/sections/Turn.tsx`)**

Short single-paragraph pivot. Vignette background, highlighted "assembles" word with Citrus color.

**Task 3.4: Services Overview (`components/sections/ServicesOverview.tsx`)**

2x2 grid of service cards (4 pillars). Each card:
- Icon (Lucide, Cobalt)
- Title (Instrument Serif italic, H3)
- One-line description
- "Read more →" link to service detail page
- Hover: 3D tilt effect (perspective transform), shadow deepens

**Task 3.5: Why Choose Us (`components/sections/WhyChooseUs.tsx`)**

5 reasons in a horizontal scroll on mobile, grid on desktop. Each reason:
- Number (large, Instrument Serif italic, Cobalt)
- Title
- Short description

**Task 3.6: About Mini (`components/sections/AboutMini.tsx`)**

Two-column layout:
- Left: Small square image (Shoaib's photo)
- Right: "Hey, I'm Shoaib." + short intro + CTA to full About page

**Task 3.7: Case Studies Preview (`components/sections/CaseStudiesPreview.tsx`)**

3 case study cards (fetch from `content/case-studies/*.mdx`). Each card:
- Industry tag
- Client name
- One-line outcome
- Hover: subtle zoom + overlay reveal

**Task 3.8: Philosophy Block (`components/sections/Philosophy.tsx`)**

Full-viewport section. Center-aligned quote:
> "I don't sell services.
> I sell outcomes I'd stake my name on."
> — Shoaib Nabi Noor

Animated Cobalt line underneath the quote (draws itself on scroll into view).

**Task 3.9: Testimonials (`components/sections/Testimonials.tsx`)**

Carousel with 3 visible on desktop, 1 on mobile. Use Framer Motion for slide animations. Placeholder testimonials until real ones collected.

**Task 3.10: FAQ (`components/sections/FAQ.tsx`)**

Accordion. Framer Motion for height animation. 7 questions from master plan.

**Task 3.11: Final CTA (`components/sections/FinalCTA.tsx`)**

Full-viewport section. Large "Let's assemble yours." heading, sub-copy, two CTAs.

**Task 3.12: Trust Signals (`components/sections/TrustSignals.tsx`)**

Thin bar above footer with platform certifications.

---

### PHASE 4: Other Pages (Day 7-10)

**Task 4.1: Services Page (`app/(marketing)/services/page.tsx`)**

Follow copy from master plan document. 4 detailed service breakdowns + "What I don't do" + Process section + Final CTA.

**Task 4.2: About Page (`app/(marketing)/about/page.tsx`)**

Follow copy from master plan document. 7 sections including philosophy block, opinions, industries, and practical bits.

**Task 4.3: Case Studies Index (`app/(marketing)/case-studies/page.tsx`)**

Grid of case study cards. Fetch all MDX files from `content/case-studies/`.

**Task 4.4: Case Study Template (`app/(marketing)/case-studies/[slug]/page.tsx`)**

Dynamic route rendering individual case study MDX with proper metadata.

**Task 4.5: Blog Index (`app/(marketing)/blog/page.tsx`)**

Fetch posts from Sanity. Grid layout with category filter. Featured post at top.

**Task 4.6: Blog Post Template (`app/(marketing)/blog/[slug]/page.tsx`)**

Dynamic route. Fetch single post from Sanity by slug. Include:
- Hero image
- Title (Instrument Serif italic, large)
- Author byline (Shoaib Nabi Noor + date)
- Body (Portable Text rendered)
- FAQ section
- Author bio card at bottom
- "Read more posts" section

**Task 4.7: Blog Category Pages (`app/(marketing)/blog/category/[category]/page.tsx`)**

Filter posts by category. Same layout as blog index.

**Task 4.8: Resume Page (`app/(marketing)/shoaib-nabi-noor/page.tsx`)**

Full CV layout with all sections from master plan. Sticky "Download PDF" button.

Add redirect: `/cv` → `/shoaib-nabi-noor` in `next.config.js`.

**Task 4.9: Contact Page (`app/(marketing)/contact/page.tsx`)**

Three contact channels + form + location/availability + soft CTA.

---

### PHASE 5: Sanity CMS Setup (Day 11)

**Task 5.1: Initialize Sanity Studio**

Embedded at `/studio` route (accessible only to Shoaib):

```bash
npx sanity@latest init --env
```

**Task 5.2: Create Schemas**

`sanity/schemas/post.ts`:

```ts
export default {
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: Rule => Rule.required() },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } },
    { name: 'excerpt', title: 'Excerpt', type: 'text', rows: 3 },
    { name: 'coverImage', title: 'Cover Image', type: 'image' },
    { name: 'category', title: 'Category', type: 'string', options: {
      list: ['Meta Ads', 'Google Ads', 'Tracking', 'Funnels & Web', 'Case Studies', 'Opinions', 'Personal Brand']
    }},
    { name: 'publishedAt', title: 'Published At', type: 'datetime' },
    { name: 'body', title: 'Body', type: 'array', of: [{ type: 'block' }, { type: 'image' }] },
    { name: 'seo', title: 'SEO', type: 'object', fields: [
      { name: 'metaTitle', type: 'string' },
      { name: 'metaDescription', type: 'string' },
      { name: 'keywords', type: 'array', of: [{ type: 'string' }] },
    ]},
    { name: 'faqs', title: 'FAQs', type: 'array', of: [{
      type: 'object',
      fields: [
        { name: 'question', type: 'string' },
        { name: 'answer', type: 'text' },
      ],
    }]},
  ],
}
```

**Task 5.3: Sanity Client Setup**

`lib/sanity.ts` — create client + image URL builder + query helpers.

---

### PHASE 6: SEO & AEO Implementation (Day 12)

**Task 6.1: Metadata Per Page**

Every page gets `generateMetadata()` with:
- title, description
- openGraph (title, description, images)
- twitter card
- canonical URL

Use exact metadata from master plan.

**Task 6.2: JSON-LD Schema Injection**

Create `components/shared/JsonLd.tsx` that injects schema per page type:
- Organization (site-wide)
- Person (About + Resume)
- Service (Services page)
- Article + FAQPage (Blog posts)
- BreadcrumbList (all pages)

**Task 6.3: Sitemap**

`app/sitemap.ts` — auto-generate from all pages + dynamic routes (blog posts, case studies).

**Task 6.4: Robots**

`app/robots.ts` — allow all, sitemap reference.

**Task 6.5: Dynamic OG Images**

`app/api/og/route.tsx` — generate branded OG images per page using @vercel/og.

---

### PHASE 7: Integrations (Day 13)

**Task 7.1: Contact Form API**

`app/api/contact/route.ts`:
- Validate with Zod
- Save to Supabase table `contacts`
- Send notification email via Resend to Shoaib
- Send auto-reply email to submitter

**Task 7.2: Newsletter Signup API**

`app/api/newsletter/route.ts`:
- Validate email
- Save to Supabase table `subscribers`
- (Optional) Sync to Beehiiv/ConvertKit via their API

**Task 7.3: Analytics**

`app/layout.tsx` — inject GA4, GTM, Meta Pixel via `next/script`.

**Task 7.4: Meta Conversion API (Server-side)**

`lib/meta-capi.ts` — helper to send events server-side.

Fire from contact form submission, newsletter signup, key page views.

**Task 7.5: Calendly Integration**

Embed Calendly popup in "Book a Call" buttons using their JS widget.

---

### PHASE 8: Content Setup (Day 14)

**Task 8.1: Create Placeholder Case Studies**

Create 5 MDX files in `content/case-studies/`:
- `boutique-hotel-multan.mdx`
- `dha-real-estate.mdx`
- `choice-shoes-ecom.mdx`
- `meezab-z-b2b-pharma.mdx`
- `multan-law-firm.mdx`

Use placeholder outcomes as per master plan. Include frontmatter:

```yaml
---
title: "How We Rebuilt a Boutique Hotel's Digital Presence in 90 Days"
industry: "Hospitality"
client: "Placeholder Hotel"
excerpt: "..."
coverImage: "/images/case-studies/hotel-placeholder.jpg"
outcome: "+300% direct bookings"
publishedAt: "2025-01-15"
---
```

**Task 8.2: Write First 2 Blog Posts**

Publish via Sanity Studio:
1. "How to Reduce Meta Ads Cost Per Lead by 40% — A Media Buyer's Field Guide"
2. "From Accountant to Media Buyer: Why Numbers Still Matter in Modern Marketing"

---

### PHASE 9: Polish & Optimization (Day 15)

**Task 9.1: Performance Optimization**

- Lazy load below-the-fold images
- Preload critical fonts
- Split code for heavy components (Framer Motion, Lenis)
- Use `next/image` for all images
- Compress all assets

**Task 9.2: Accessibility**

- Semantic HTML (proper heading hierarchy)
- Alt text on all images
- ARIA labels on interactive elements
- Keyboard navigation testing
- Focus states visible

**Task 9.3: Mobile Testing**

- Test on real iOS + Android
- Fix touch targets (min 44x44px)
- Verify smooth scroll works
- Test hamburger nav

**Task 9.4: Cross-Browser Testing**

- Chrome, Safari, Firefox, Edge
- Test animations don't break

---

### PHASE 10: Deployment (Day 16)

**Task 10.1: Deploy to Vercel**

```bash
npm i -g vercel
vercel
```

**Task 10.2: Add Environment Variables in Vercel**

Copy all from `.env.local` to Vercel dashboard.

**Task 10.3: Connect Domain**

Point `adsbyshoaib.com` DNS to Vercel:
- A record: `76.76.21.21`
- CNAME (www): `cname.vercel-dns.com`

**Task 10.4: Setup Vercel Analytics**

Enable in project settings.

**Task 10.5: Submit to Search Engines**

- Google Search Console: verify + submit sitemap
- Bing Webmaster Tools: verify + submit sitemap

**Task 10.6: Test Live Site**

- All pages load
- Forms work (test contact + newsletter)
- Analytics firing
- Meta Pixel firing
- SSL active
- Sitemap accessible
- 404 page works

---

## POST-BUILD CHECKLIST

- [ ] All 7 pages built + reviewed
- [ ] Mobile tested on real devices (iOS + Android)
- [ ] Contact form tested (email arrives)
- [ ] Newsletter signup tested
- [ ] Calendly integration tested
- [ ] All animations smooth (60fps)
- [ ] Lighthouse score 90+ (Performance, SEO, Accessibility, Best Practices)
- [ ] Core Web Vitals green (LCP <2.5s, FID <100ms, CLS <0.1)
- [ ] All meta tags per page correct
- [ ] JSON-LD schema validated (Google Rich Results Test)
- [ ] GA4 events firing correctly
- [ ] Meta Pixel + CAPI firing correctly
- [ ] Sanity Studio accessible at /studio
- [ ] Blog posts publish + render correctly
- [ ] Case studies render from MDX
- [ ] Sitemap auto-updates with new content
- [ ] Robots.txt configured
- [ ] Favicon + Apple Touch Icon uploaded
- [ ] 404 page branded
- [ ] Privacy Policy + Terms of Service pages
- [ ] All internal links working (no 404s)
- [ ] SSL certificate active
- [ ] DNS pointed to Vercel

---

## COPY REFERENCE

**Location:** All final copy for all 7 pages is documented in:
1. `adsbyshoaib-home-conversion-copy.md`
2. `adsbyshoaib-remaining-pages.md`
3. `adsbyshoaib-home-resume-blog.md`

**Rule:** Copy is FINAL — do not modify unless Shoaib explicitly requests. If any placeholder needs updating (e.g., ad spend figure), ask Shoaib first.

---

## DESIGN REFERENCE FILES

Visual mockups already created (use as design reference):
1. `adsbyshoaib-hero-clean.html` — Final hero layout (text left, image right, no cards)
2. `adsbyshoaib-color-palette.html` — Color system visualization

---

## PENDING ITEMS (Shoaib to Provide)

1. **Professional headshot** — for hero, About page, Resume page
2. **Final logo** — SVG + PNG variants (light + dark)
3. **Client testimonials** — text + photos (5-7 minimum)
4. **Real case study outcomes** — replace placeholders once collected
5. **Final ad spend figure + currency** — currently $2.5M+, may change
6. **Calendly URL** — for "Book a Call" integration
7. **Contact photo/branding** — any additional visuals for individual pages
8. **Competitor list** — 3-5 personal brand media buyers for benchmarking

---

## BRAND VOICE REMINDERS (Critical for Content)

- **Direct** — no fluff, no corporate speak
- **Evidence-led** — every claim has proof or data
- **Lightly witty** — dry humor, never forced
- **Confident but not arrogant** — state facts without bragging
- **Personal** — first person ("I"), not "we" (aap solo hain)
- **Honest** — mention what you don't do (design/video/photo via collaborators)

**Avoid:**
- "Passionate", "innovative", "cutting-edge", "seamless", "leverage"
- "We" (aap ek hi ho)
- "Freelancer", "one-person operation", "just me"
- Solo status references

**Use:**
- "Independent practice"
- "Ads by Shoaib"
- "Specialist network" (for collaborators)
- "Managed, not just monitored" (signature phrase)

---

## SUCCESS METRICS TO TRACK POST-LAUNCH

**Month 1:**
- Site launched, all pages indexed
- GA4 tracking events firing
- First 100 organic visitors

**Month 3:**
- 6 blog posts published
- 1,000+ monthly organic visitors
- Ranking on 20+ long-tail keywords
- First contact form submission from cold traffic

**Month 6:**
- 3,000+ monthly organic visitors
- 2-3 keywords ranking top 10
- Newsletter subscribers: 100+
- First AI recommendation test passed (ask ChatGPT "best media buyer Pakistan")

**Month 12:**
- 10,000+ monthly organic visitors
- 5-10 keywords in top 3
- Consistent AI recommendations across ChatGPT, Claude, Perplexity
- "Shoaib Nabi Noor" ranks #1 for name search
- Solid inbound lead pipeline from organic traffic

---

## FINAL NOTES FOR CLAUDE CODE

1. **Follow the phase order exactly** — foundation before components before pages.
2. **Copy is locked** — use exactly as provided in reference files.
3. **Design system is locked** — Cloud/Ink/Cobalt/Citrus, Instrument Serif/Geist, no deviations.
4. **Test on real mobile** — desktop preview lies.
5. **Ask Shoaib before creative decisions** — visual style, animation intensity, layout changes.
6. **Optimize as you build** — don't leave performance for the end.
7. **Deploy incrementally** — push to Vercel after each phase completes.

**Contact for questions during build:**
- Shoaib Nabi Noor
- shoaib.nabi.noor@gmail.com
- +92 301 7461642

---

**END OF INSTRUCTIONS**
