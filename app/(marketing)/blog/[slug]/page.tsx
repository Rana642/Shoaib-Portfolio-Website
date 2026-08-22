import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import { posts, getPost } from "@/lib/posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const morePosts = posts.filter((p) => p.slug !== post.slug).slice(0, 2);
  const date = new Date(post.publishedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PageWrapper>
      <article className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Link
              href="/blog"
              className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-10"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
              All posts
            </Link>
            <Tag>{post.category}</Tag>
            <h1 className="font-serif italic text-h2 mt-8 max-w-3xl">{post.title}</h1>
            <div className="flex items-center gap-4 mt-8 pt-8 border-t border-ink/10">
              <div className="relative size-12 rounded-full overflow-hidden shrink-0">
                <Image
                  src="/images/shoaib.png"
                  alt="Shoaib Nabi Noor"
                  fill
                  sizes="48px"
                  className="object-cover object-top"
                />
              </div>
              <div>
                <p className="text-small font-medium">Shoaib Nabi Noor</p>
                <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mt-1">
                  {date} · {post.readingTime}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-10 max-w-2xl space-y-5">
              {post.body.map((para, i) => (
                <p key={i} className="text-body-lg text-ink-muted">
                  {para}
                </p>
              ))}
            </div>
          </Reveal>

          {/* Author bio card */}
          <Reveal delay={0.15}>
            <aside className="mt-16 bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 flex flex-col sm:flex-row gap-6 items-start max-w-2xl">
              <div className="relative size-20 rounded-xl overflow-hidden shrink-0">
                <Image
                  src="/images/shoaib.png"
                  alt="Shoaib Nabi Noor"
                  fill
                  sizes="80px"
                  className="object-cover object-top"
                />
              </div>
              <div>
                <p className="text-body-lg font-semibold">Written by Shoaib Nabi Noor</p>
                <p className="text-small text-ink-muted mt-2">
                  Independent performance marketing practice — six years in paid media
                  across Meta, Google, YouTube, and TikTok. Managed, not just monitored.
                </p>
                <div className="mt-4">
                  <Button href="/contact" variant="ghost" withArrow>
                    Get a free audit
                  </Button>
                </div>
              </div>
            </aside>
          </Reveal>
        </div>
      </article>

      {/* Read more */}
      {morePosts.length > 0 && (
        <section className="pb-24 md:pb-32">
          <div className="container-narrow">
            <Reveal>
              <h2 className="font-serif italic text-h3">
                Keep reading<span className="text-citrus">.</span>
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
              {morePosts.map((p, i) => (
                <Reveal key={p.slug} delay={i * 0.08}>
                  <Link
                    href={`/blog/${p.slug}`}
                    className="group flex flex-col h-full bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                        {p.category}
                      </span>
                      <ArrowUpRight className="size-5 text-ink-subtle group-hover:text-ink transition-colors" aria-hidden />
                    </div>
                    <h3 className="font-serif italic text-h3 mt-5">{p.title}</h3>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </PageWrapper>
  );
}
