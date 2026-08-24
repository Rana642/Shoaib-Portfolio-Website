/*
 * DRAFT — standard practice for a marketing site with a contact form,
 * newsletter, analytics/pixel tracking, and (2026-08-24) disclosure for
 * Google Business Profile API / OAuth access ahead of Shoaib's API
 * application — see the "Google API Services disclosure" section; it
 * carries the "Google API Services User Data Policy" + "Limited Use"
 * phrasing Google's reviewers check for verbatim, so don't reword it.
 * Restructured 2026-08-24 for API-review completeness (GDPR legal basis,
 * sub-processor table, security, international transfers, children's
 * privacy) — modeled on how established SaaS companies structure this,
 * but every claim here is scoped to what's actually true of a solo
 * independent practice, not a registered company (no DPA/entity/referral-
 * program clauses — those don't apply here).
 * NOT legal advice — Shoaib should have this reviewed before it's treated
 * as final.
 */
import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description: "How Ads by Shoaib collects, uses, and protects your information.",
  path: "/privacy",
});

type Section = {
  id: string;
  title: string;
  intro?: string;
  body?: string[];
  subsections?: { heading: string; items: string[] }[];
  table?: { headers: string[]; rows: string[][] };
};

const sections: Section[] = [
  {
    id: "collect",
    title: "Information I collect",
    subsections: [
      {
        heading: "Information you give me directly",
        items: [
          "Contact form submissions: name, email, business name, budget range, and message.",
          "Newsletter signups: email address only.",
        ],
      },
      {
        heading: "Information collected automatically",
        items: [
          "Standard analytics data: pages visited, device/browser type, approximate location, and referral source.",
        ],
      },
      {
        heading: "Information from accounts you connect",
        items: [
          "For clients who authorize it: campaign metrics from ad accounts, and Google Business Profile data (business information, reviews, posts, and performance insights) — accessed through each platform's own official OAuth-based API, only for accounts explicitly connected, and only to do the work agreed with that client.",
        ],
      },
    ],
  },
  {
    id: "use",
    title: "How I use it",
    body: [
      "To respond to audit requests and inquiries submitted through the contact form.",
      "To send newsletter updates to people who opted in — and nothing else.",
      "To understand how visitors use this site and improve it over time.",
      "To measure whether advertising I run (on Meta, Google, etc.) actually leads to inquiries — this is the whole point of a performance marketing practice being transparent about its own numbers.",
      "To manage, audit, and optimize a client's Google Business Profile — business information, posts, and reviews — for clients who've connected that access to me.",
    ],
  },
  {
    id: "legal-basis",
    title: "Legal basis for processing (EU/UK visitors)",
    body: [
      "If you're located in the European Economic Area or the UK, I process your data on one of these bases: your consent (e.g. a newsletter signup), the steps needed to respond to a contact-form inquiry you've started, my legitimate interest in running and improving this practice, or a client's explicit authorization for me to manage their connected accounts.",
      "You can withdraw consent at any time — see \"Your privacy rights\" below.",
    ],
  },
  {
    id: "sharing",
    title: "Sharing & the tools that process data on my behalf",
    intro:
      "I don't sell, rent, or trade your personal data, business data, or any data accessed through a connected account to any third party, under any circumstances. Data is only shared with the services below, each acting on my behalf — never with unrelated marketing networks or data brokers.",
    table: {
      headers: ["Service", "Purpose", "What it processes"],
      rows: [
        ["Supabase", "Stores form submissions", "Contact form & newsletter data"],
        ["Resend", "Sends transactional email", "Name & email, for the messages you'd expect"],
        [
          "Google Analytics 4 & Tag Manager",
          "Site usage analytics",
          "Pages visited, device, approximate location",
        ],
        [
          "Meta Pixel & Conversions API",
          "Measures ad performance",
          "Page events; emails hashed (SHA-256) before sending",
        ],
        [
          "Google Business Profile APIs",
          "Manages a client's Business Profile",
          "Business info, reviews, posts — client-authorized only",
        ],
        ["Vercel", "Hosting & basic traffic analytics", "Standard request/traffic logs"],
        ["Sanity", "Stores blog & site content", "No visitor personal data"],
      ],
    },
  },
  {
    id: "google-api",
    title: "Google API Services disclosure",
    body: [
      "adsbyshoaib.com's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      "Google Business Profile data is accessed only for clients who've connected their account to me via Google OAuth 2.0, used strictly to manage business information, posts, and reviews on their behalf — never sold, and never used for advertising or any purpose beyond the service that client asked for.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies & tracking technologies",
    body: [
      "This site uses cookies set by the analytics and advertising tools listed above to recognize repeat visits and measure ad performance — nothing beyond what's needed to run a small marketing practice.",
      "You can disable cookies in your browser settings at any time; the site will still function, though some tracking will be less accurate.",
    ],
  },
  {
    id: "security",
    title: "Data security",
    body: [
      "This site is served over HTTPS, and the tools listed above encrypt data in transit and at rest as standard practice on their platforms.",
      "Access to the underlying systems (form submissions, content, the client dashboard) is restricted to me alone, protected by authentication.",
      "No payment card details are collected through adsbyshoaib.com — I don't process payments through this website.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    body: [
      "Contact form submissions and newsletter subscriptions are kept as long as needed to run this practice, or until you ask for deletion.",
      "Connected-account data (Google Business Profile, ad accounts, etc.) is only accessed while I'm actively working on it and is not retained beyond what's needed for that work.",
    ],
  },
  {
    id: "rights",
    title: "Your privacy rights",
    body: [
      "Regardless of where you're located, you can ask what data I hold about you, ask me to correct it, or ask me to delete it, by emailing hello@adsbyshoaib.com.",
      "If you're in the EEA or UK, you additionally have the right to data portability, to object to or restrict processing, and to lodge a complaint with your local data protection authority.",
      "You can unsubscribe from the newsletter at any time via the link in any email.",
      "If you've connected a Google, Meta, or other account so I can manage it on your behalf, you can revoke that access at any time from that platform's own security settings — for Google, at myaccount.google.com/permissions.",
    ],
  },
  {
    id: "transfers",
    title: "International data transfers",
    body: [
      "I'm based in Multan, Pakistan, and some clients I work with are based elsewhere, including the EU. The tools listed above may process and store data in other countries — primarily the United States and the EU, where those providers operate infrastructure — each under its own safeguards for cross-border data transfer.",
    ],
  },
  {
    id: "children",
    title: "Children's privacy",
    body: [
      "This site and its services aren't directed at anyone under 18, and I don't knowingly collect personal data from children. If you believe a child has provided data through this site, contact me and I'll remove it.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: [
      "This policy may be updated as the practice, its tools, or its API integrations evolve. The date below reflects the most recent version.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: ["Questions about this policy: hello@adsbyshoaib.com or +92 301 7461642."],
  },
];

export default function PrivacyPage() {
  return (
    <PageWrapper>
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Legal</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              Privacy Policy<span className="text-citrus">.</span>
            </h1>
            <p className="text-small text-ink-subtle mt-4">Last updated: August 24, 2026</p>
            <p className="text-body text-ink-muted mt-6 max-w-2xl">
              Ads by Shoaib is Shoaib Nabi Noor's independent performance marketing practice,
              based in Multan, Punjab, Pakistan — formerly operated under the name Socially Snap.
              This policy explains what information I collect through adsbyshoaib.com and through
              any Google, Meta, or other account a client authorizes me to manage on their behalf,
              how I use it, and the choices you have.
            </p>
          </Reveal>

          <Reveal className="mt-10 max-w-3xl">
            <div className="border border-ink/10 rounded-2xl p-6 bg-white/50">
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-4">
                On this page
              </p>
              <nav className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="text-small text-ink-muted hover:text-cobalt transition-colors"
                  >
                    {section.title}
                  </a>
                ))}
              </nav>
            </div>
          </Reveal>

          <div className="mt-14 max-w-3xl space-y-12">
            {sections.map((section) => (
              <Reveal key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="font-serif italic text-h3 mb-4">{section.title}</h2>

                {section.intro && (
                  <p className="text-body text-ink-muted mb-4">{section.intro}</p>
                )}

                {section.body && (
                  <div className="space-y-3">
                    {section.body.map((para, i) => (
                      <p key={i} className="text-body text-ink-muted">
                        {para}
                      </p>
                    ))}
                  </div>
                )}

                {section.subsections && (
                  <div className="space-y-6">
                    {section.subsections.map((sub) => (
                      <div key={sub.heading}>
                        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-2">
                          {sub.heading}
                        </p>
                        <div className="space-y-3">
                          {sub.items.map((item, i) => (
                            <p key={i} className="text-body text-ink-muted">
                              {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {section.table && (
                  <div className="overflow-x-auto border border-ink/10 rounded-xl">
                    <table className="w-full text-left border-collapse min-w-[560px]">
                      <thead>
                        <tr className="bg-white/60">
                          {section.table.headers.map((h) => (
                            <th
                              key={h}
                              className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-4 py-3 border-b border-ink/10"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row, ri) => (
                          <tr key={ri} className={ri > 0 ? "border-t border-ink/10" : ""}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className={
                                  ci === 0
                                    ? "text-small font-semibold px-4 py-3 align-top"
                                    : "text-small text-ink-muted px-4 py-3 align-top"
                                }
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
