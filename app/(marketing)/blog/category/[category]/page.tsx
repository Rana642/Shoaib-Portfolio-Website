import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import JsonLd from "@/components/shared/JsonLd";
import { categories, categorySlug, getPostsByCategory, estimateReadingTime } from "@/lib/posts";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export function generateStaticParams() {
  return categories.map((c) => ({ category: categorySlug(c) }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/category/[category]">): Promise<Metadata> {
  const { category } = await params;
  const name = categories.find((c) => categorySlug(c) === category);
  if (!name) return {};
  return pageMetadata({
    title: `${name} — Blog`,
    description: `Posts on ${name} from Shoaib Nabi Noor's performance marketing practice.`,
    path: `/blog/category/${category}`,
  });
}

export default async function BlogCategoryPage({
  params,
}: PageProps<"/blog/category/[category]">) {
  const { category } = await params;
  const name = categories.find((c) => categorySlug(c) === category);
  if (!name) notFound();

  const filtered = await getPostsByCategory(category);

  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
          { name, path: `/blog/category/${category}` },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Link
              href="/blog"
              className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-10"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
              All posts
            </Link>
            <Tag>Category</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              {name}
              <span className="text-citrus">.</span>
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="pb-24 md:pb-32">
        <div className="container-wide">
          {filtered.length === 0 ? (
            <Reveal>
              <div className="border border-ink/10 rounded-2xl p-12 text-center max-w-xl mx-auto">
                <p className="text-body-lg text-ink-muted">
                  Nothing published here yet — the first {name} post is on its way.
                </p>
                <Link
                  href="/blog"
                  className="inline-block mt-4 text-body font-medium underline-offset-4 decoration-citrus decoration-2 hover:underline"
                >
                  Browse all posts
                </Link>
              </div>
            </Reveal>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((post, i) => (
                <Reveal key={post.slug} delay={i * 0.08}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex flex-col h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                        {post.category}
                      </span>
                      <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink transition-colors" aria-hidden />
                    </div>
                    <h2 className="font-serif italic text-h3 mt-5 flex-1">{post.title}</h2>
                    <p className="text-small text-ink-muted mt-3">{post.excerpt}</p>
                    <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-6">
                      {estimateReadingTime(post.body)}
                    </span>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageWrapper>
  );
}
