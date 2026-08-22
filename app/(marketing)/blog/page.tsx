import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import JsonLd from "@/components/shared/JsonLd";
import { getAllPosts, categories, categorySlug, estimateReadingTime } from "@/lib/posts";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  description:
    "Field notes on Meta Ads, Google Ads, tracking, and funnels — what actually moves the needle in paid media, from Shoaib Nabi Noor's independent practice.",
  path: "/blog",
});

export default async function BlogPage() {
  const posts = await getAllPosts();
  const [featured, ...rest] = posts;

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Blog</Tag>
            <h1 className="font-serif italic text-hero mt-8 max-w-3xl">
              Field notes, not fluff<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-2xl">
              What I'm seeing inside real ad accounts — written for people who spend their
              own money on ads and want it back with interest.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-24 md:pb-32">
        <div className="container-wide">
          {/* Category filter */}
          <Reveal className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="font-mono uppercase text-tag tracking-widest rounded-full bg-ink text-cloud px-4 py-2.5"
            >
              All
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat}
                href={`/blog/category/${categorySlug(cat)}`}
                className="font-mono uppercase text-tag tracking-widest rounded-full border border-ink/15 px-4 py-2.5 hover:border-citrus hover:bg-citrus/15 transition-all"
              >
                {cat}
              </Link>
            ))}
          </Reveal>

          {/* Featured post */}
          {featured && (
            <Reveal delay={0.1}>
              <Link
                href={`/blog/${featured.slug}`}
                className="group grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12 bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 md:p-12 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:border-citrus/40"
              >
                <div>
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    Featured · {featured.category}
                  </span>
                  <h2 className="font-serif italic text-h2 mt-6 group-hover:underline decoration-citrus decoration-2 underline-offset-8">
                    {featured.title}
                  </h2>
                </div>
                <div className="flex flex-col justify-between">
                  <p className="text-body-lg text-ink-muted">{featured.excerpt}</p>
                  <div className="flex items-center justify-between mt-8">
                    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                      {estimateReadingTime(featured.body)}
                    </span>
                    <ArrowUpRight
                      className="size-6 text-ink-subtle transition-all duration-300 group-hover:text-ink group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </div>
                </div>
              </Link>
            </Reveal>
          )}

          {/* Rest */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {rest.map((post, i) => (
              <Reveal key={post.slug} delay={i * 0.08}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                >
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                    {post.category}
                  </span>
                  <h2 className="font-serif italic text-h3 mt-5 flex-1">{post.title}</h2>
                  <p className="text-small text-ink-muted mt-3">{post.excerpt}</p>
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-6">
                    {estimateReadingTime(post.body)}
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
