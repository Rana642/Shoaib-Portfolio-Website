/*
 * DRAFT COPY — pending Shoaib's final copy files.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import Button from "@/components/ui/Button";
import FinalCTA from "@/components/sections/FinalCTA";
import JsonLd from "@/components/shared/JsonLd";
import { services, getService } from "@/lib/services";
import { pageMetadata } from "@/lib/seo";
import { serviceSchema, breadcrumbSchema } from "@/lib/schema";

export function generateStaticParams() {
  return services.map((s) => ({ service: s.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/services/[service]">): Promise<Metadata> {
  const { service: slug } = await params;
  const service = getService(slug);
  if (!service) return {};
  return pageMetadata({
    title: service.title,
    description: service.summary,
    path: `/services/${service.slug}`,
  });
}

export default async function ServiceDetailPage({
  params,
}: PageProps<"/services/[service]">) {
  const { service: slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  return (
    <PageWrapper>
      <JsonLd data={serviceSchema(service)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
          { name: service.title, path: `/services/${service.slug}` },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Link
              href="/services"
              className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-10"
            >
              <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
              All services
            </Link>
            <Tag>Service</Tag>
            <h1 className="font-serif italic text-hero mt-8">
              {service.title}
              <span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg font-medium mt-5 relative inline-block">
              <span className="absolute inset-x-0 bottom-0.5 h-[35%] bg-citrus/40 -z-0 rounded-sm" />
              <span className="relative">{service.tagline}</span>
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-10 max-w-2xl space-y-5">
              {service.description.map((para, i) => (
                <p key={i} className="text-body-lg text-ink-muted">
                  {para}
                </p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-white/40">
        <div className="container-narrow grid grid-cols-1 md:grid-cols-2 gap-10">
          <Reveal>
            <div className="bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 h-full">
              <h2 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                What you get
              </h2>
              <ul className="mt-6 space-y-4">
                {service.deliverables.map((item) => (
                  <li key={item} className="flex gap-3 items-start">
                    <Check className="size-5 text-cobalt shrink-0 mt-0.5" aria-hidden />
                    <span className="text-body">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 h-full">
              <h2 className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                Best for
              </h2>
              <ul className="mt-6 space-y-4">
                {service.bestFor.map((item) => (
                  <li key={item} className="flex gap-3 items-start">
                    <span className="size-1.5 rounded-full bg-citrus inline-block shrink-0 mt-2.5" aria-hidden />
                    <span className="text-body">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 pt-6 border-t border-ink/10">
                <p className="text-small text-ink-muted">
                  Not sure this is the right pillar for you? The free audit sorts that out
                  before any money moves.
                </p>
                <div className="mt-5">
                  <Button href="/contact" withArrow>
                    Get a free audit
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <FinalCTA />
    </PageWrapper>
  );
}
