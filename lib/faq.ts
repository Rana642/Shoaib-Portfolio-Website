/*
 * DRAFT COPY — 7 questions in brand voice, pending Shoaib's final FAQ list.
 * Shared between FAQ.tsx (renders it) and the home page (builds FAQPage
 * JSON-LD from it) so the two never drift apart.
 */

export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  {
    q: "What exactly do you do?",
    a: "I plan, launch, and manage paid advertising across Meta, Google, YouTube, and TikTok — plus the tracking and landing pages that make those ads measurable. One practice, full funnel.",
  },
  {
    q: "Are you an agency?",
    a: "No — this is an independent practice. You work directly with me, and I bring in a specialist network for design, video, or development when a project calls for it. No account managers in between.",
  },
  {
    q: "What budgets do you work with?",
    a: "Enough to learn and scale — typically from a few hundred dollars a month in ad spend upward. If your budget is too small to generate usable data, I'll tell you that in the first call instead of taking it.",
  },
  {
    q: "How do you charge?",
    a: "Monthly retainer for ongoing management, or a fixed project fee for defined builds like tracking setups and funnels. Both doors are open — we pick whichever fits your situation.",
  },
  {
    q: "How soon will I see results?",
    a: "Tracking and structure land in week one. Meaningful signal takes 2–6 weeks depending on budget and sales cycle. Anyone promising day-three profitability is selling you a screenshot.",
  },
  {
    q: "Do you also do design and video?",
    a: "Creative direction, yes — production runs through my specialist network. You get one accountable point of contact either way.",
  },
  {
    q: "How do we start?",
    a: "Book a free audit. I'll look at your account (or your plans), tell you what I'd fix first, and you decide whether we work together. No obligation either way.",
  },
];
