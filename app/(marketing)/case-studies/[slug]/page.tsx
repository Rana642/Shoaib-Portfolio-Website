import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MDXRemote } from "next-mdx-remote/rsc";
import { PortableText, type PortableTextComponents } from "next-sanity";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { getAllCaseStudies, getCaseStudy } from "@/lib/case-studies";
import { pageMetadata } from "@/lib/seo";
import { caseStudySchema, breadcrumbSchema } from "@/lib/schema";

export async function generateStaticParams() {
  const caseStudies = await getAllCaseStudies();
  return caseStudies.map((cs) => ({ slug: cs.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/case-studies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) return {};
  return pageMetadata({
    title: cs.title,
    description: cs.excerpt,
    path: `/case-studies/${cs.slug}`,
  });
}

const mdxComponents = {
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="font-serif italic text-h3 mt-12 mb-4" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-body-lg text-ink-muted mt-4" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mt-4 space-y-3" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li
      className="text-body text-ink-muted flex gap-3 items-start before:content-[''] before:size-1.5 before:rounded-full before:bg-citrus before:inline-block before:shrink-0 before:mt-2.5"
      {...props}
    />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="border-l-2 border-citrus bg-citrus/10 rounded-r-xl px-6 py-4 mt-6 text-small text-ink-muted [&_p]:mt-0 [&_p]:text-small"
      {...props}
    />
  ),
};

// Same visual treatment as the MDX components, for Sanity-authored bodies
const portableTextComponents: PortableTextComponents = {
  block: {
    normal: ({ children }) => <p className="text-body-lg text-ink-muted mt-4">{children}</p>,
    h2: ({ children }) => <h2 className="font-serif italic text-h3 mt-12 mb-4">{children}</h2>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-citrus bg-citrus/10 rounded-r-xl px-6 py-4 mt-6 text-small text-ink-muted">
        {children}
      </blockquote>
    ),
  },
  list: {
    bullet: ({ children }) => <ul className="mt-4 space-y-3">{children}</ul>,
  },
  listItem: {
    bullet: ({ children }) => (
      <li className="text-body text-ink-muted flex gap-3 items-start">
        <span className="size-1.5 rounded-full bg-citrus inline-block shrink-0 mt-2.5" aria-hidden />
        {children}
      </li>
    ),
  },
};

export default async function CaseStudyPage({
  params,
}: PageProps<"/case-studies/[slug]">) {
  const { slug } = await params;
  const cs = await getCaseStudy(slug);
  if (!cs) notFound();

  return (
    <PageWrapper>
      <JsonLd data={caseStudySchema(cs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Case Studies", path: "/case-studies" },
          { name: cs.title, path: `/case-studies/${cs.slug}` },
        ])}
      />
      <article className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Link
              href="/case-studies"
              className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-10"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
              All case studies
            </Link>
            <Tag>{cs.industry}</Tag>
            <h1 className="font-serif italic text-h2 mt-8 max-w-3xl">{cs.title}</h1>
            <div className="flex flex-wrap gap-x-12 gap-y-4 mt-8 pt-8 border-t border-ink/10">
              <div>
                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                  Client
                </p>
                <p className="text-body font-medium mt-2">{cs.client}</p>
              </div>
              <div>
                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                  Outcome
                </p>
                <p className="text-body font-medium mt-2 relative inline-block">
                  <span className="absolute inset-x-0 bottom-0.5 h-[35%] bg-citrus/40 -z-0 rounded-sm" />
                  <span className="relative">{cs.outcome}</span>
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-6 max-w-2xl">
              {cs.body.source === "sanity" ? (
                <PortableText value={cs.body.blocks} components={portableTextComponents} />
              ) : (
                <MDXRemote source={cs.body.content} components={mdxComponents} />
              )}
            </div>
          </Reveal>
        </div>
      </article>
      <FinalCTA />
    </PageWrapper>
  );
}
