/*
 * Data deletion instructions for the Meta app (Facebook Login for Business,
 * "Socially Snap Planner") — the "Data Deletion Instructions URL" Meta asks
 * for in App Review (2026-10-28). Every claim is scoped to what the code
 * actually stores: social_connections (profile id + encrypted token),
 * client_social_accounts (Page/IG id, name, encrypted token, fb_login_name),
 * scheduled_posts results (post ids). Insights are read live, never stored;
 * uploads are cleared from R2 once a post has gone out (app/api/social/cron).
 * NOT legal advice — Shoaib should have this reviewed before it's final.
 */
import type { Metadata } from "next";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Data Deletion",
  description: "How to delete the Facebook and Instagram data Ads by Shoaib holds for a connected Page or account.",
  path: "/data-deletion",
});

const sections = [
  {
    title: "Who this is for",
    body: [
      "This page is for anyone who has connected a Facebook profile, a Facebook Page or an Instagram professional account to my dashboard through the Meta app \"Socially Snap Planner\", so I can publish and report on that client's posts.",
    ],
  },
  {
    title: "What is stored",
    body: [
      "For the Facebook profile that connects: its app-scoped Facebook user ID, its name, and an access token, stored encrypted.",
      "For each connected Page or Instagram account: its ID, its name, and an access token, stored encrypted.",
      "For each post I publish: the post's ID and whether it went out, so the planner can show its status.",
      "Images uploaded for a post are deleted from storage after the post has been published. Insights and post statistics are read when needed and not stored. Nothing else from your account is kept — no friends lists, messages or other profile details.",
    ],
  },
  {
    title: "Option 1 — remove the app yourself",
    body: [
      "On Facebook: go to Settings & privacy → Settings → Business integrations, find Socially Snap Planner and select Remove.",
      "For an Instagram account connected with Instagram login: in Instagram, go to Settings → Website permissions → Apps and websites, and remove the app.",
      "Access stops straight away: the stored tokens no longer work, and nothing more can be read or posted.",
    ],
  },
  {
    title: "Option 2 — ask me to delete it",
    body: [
      "Email hello@adsbyshoaib.com with the name of the Facebook profile, Page or Instagram account. I delete the stored IDs, names, tokens and post records for it within 30 days and confirm by email.",
    ],
  },
  {
    title: "What stays on Facebook and Instagram",
    body: [
      "Posts that were already published stay on your Page or Instagram account — they are your own content. You can delete them there at any time.",
    ],
  },
  {
    title: "Contact",
    body: ["Questions about your data: hello@adsbyshoaib.com or +92 301 7461642. See also the Privacy Policy at adsbyshoaib.com/privacy."],
  },
];

export default function DataDeletionPage() {
  return (
    <PageWrapper>
      <section className="py-14 md:py-20">
        <div className="container-narrow">
          <Reveal>
            <Tag>Legal</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              Data Deletion<span className="text-citrus">.</span>
            </h1>
            <p className="text-small text-ink-subtle mt-4">Last updated: October 28, 2026</p>
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
