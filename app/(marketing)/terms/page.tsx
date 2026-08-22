/*
 * DRAFT — standard practice for a services website. NOT legal advice —
 * Shoaib should have this reviewed before it's treated as final.
 */
import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description: "Terms governing use of the Ads by Shoaib website and services.",
  path: "/terms",
});

const sections = [
  {
    title: "Who this is",
    body: [
      "adsbyshoaib.com is the website of Shoaib Nabi Noor's independent performance marketing practice. These terms cover use of the website; the scope of any paid engagement (retainer, project, or job) is set separately in writing before work begins.",
    ],
  },
  {
    title: "Using this site",
    body: [
      "This site and its content are provided for general information about the practice's services. Nothing on it constitutes a guarantee of specific advertising results — every account, budget, and market is different.",
      "Case studies and figures reflect real or representative outcomes for the clients described; past performance on one account does not guarantee results on another.",
    ],
  },
  {
    title: "The contact form and free audits",
    body: [
      "Submitting the contact form is a request for a conversation, not a binding agreement. A free audit is an initial opinion based on the information provided — it is not a full account management engagement unless agreed separately.",
    ],
  },
  {
    title: "Intellectual property",
    body: [
      "The content, design, and copy on this site belong to Shoaib Nabi Noor unless otherwise credited. Don't reproduce it elsewhere without permission.",
    ],
  },
  {
    title: "Third-party links",
    body: [
      "This site may link to third-party tools (Calendly, WhatsApp, social platforms). Their own terms and privacy policies apply once you leave this site.",
    ],
  },
  {
    title: "Changes",
    body: [
      "These terms may be updated as the practice or the site evolves. The date below reflects the most recent version.",
    ],
  },
  {
    title: "Contact",
    body: ["Questions about these terms: hello@adsbyshoaib.com or +92 301 7461642."],
  },
];

export default function TermsPage() {
  return (
    <PageWrapper>
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Legal</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              Terms of Service<span className="text-citrus">.</span>
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
