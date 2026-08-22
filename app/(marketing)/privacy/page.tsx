/*
 * DRAFT — standard practice for a marketing site with a contact form,
 * newsletter, and analytics/pixel tracking. NOT legal advice — Shoaib
 * should have this reviewed before it's treated as final.
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

const sections = [
  {
    title: "What I collect",
    body: [
      "Contact form submissions: name, email, business name, budget range, and message.",
      "Newsletter signups: email address only.",
      "Standard analytics data: pages visited, device/browser type, approximate location, and referral source — collected automatically via the tools listed below.",
    ],
  },
  {
    title: "Why I collect it",
    body: [
      "To respond to audit requests and inquiries submitted through the contact form.",
      "To send newsletter updates to people who opted in — and nothing else.",
      "To understand how visitors use this site and improve it over time.",
      "To measure whether advertising I run (on Meta, Google, etc.) actually leads to inquiries — this is the whole point of a performance marketing practice being transparent about its own numbers.",
    ],
  },
  {
    title: "Tools that process data on my behalf",
    body: [
      "Supabase — stores contact form and newsletter submissions.",
      "Resend — sends transactional emails (audit confirmations, newsletter welcome messages).",
      "Google Analytics 4 & Google Tag Manager — site usage analytics.",
      "Meta Pixel & Conversions API — measures ad performance; email addresses are hashed before being sent to Meta.",
      "Vercel — hosting and basic traffic analytics.",
      "Sanity — stores blog content (does not process visitor personal data).",
    ],
  },
  {
    title: "Cookies",
    body: [
      "This site uses cookies set by the analytics and advertising tools above to recognize repeat visits and measure ad performance. You can disable cookies in your browser settings at any time; the site will still function, though some tracking will be less accurate.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You can ask what data I hold about you, ask me to correct it, or ask me to delete it, by emailing hello@adsbyshoaib.com. You can unsubscribe from the newsletter at any time via the link in any email.",
    ],
  },
  {
    title: "Data retention",
    body: [
      "Contact form submissions and newsletter subscriptions are kept as long as needed to run this practice, or until you ask for deletion.",
    ],
  },
  {
    title: "Contact",
    body: [
      "Questions about this policy: hello@adsbyshoaib.com or +92 301 7461642.",
    ],
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
            <p className="text-small text-ink-subtle mt-4">Last updated: August 2026</p>
          </Reveal>

          <div className="mt-14 max-w-2xl space-y-12">
            {sections.map((section) => (
              <Reveal key={section.title}>
                <h2 className="font-serif italic text-h3 mb-4">{section.title}</h2>
                <div className="space-y-3">
                  {section.body.map((para, i) => (
                    <p key={i} className="text-body text-ink-muted">
                      {para}
                    </p>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
