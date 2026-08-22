/*
 * DRAFT COPY — pending Shoaib's final copy files.
 * WhatsApp number from build doc; Calendly URL pending (env var in Phase 7).
 */
import type { Metadata } from "next";
import { Mail, MessageCircle, CalendarClock, MapPin, Clock } from "lucide-react";
import PageWrapper from "@/components/layout/PageWrapper";
import Reveal from "@/components/shared/Reveal";
import Tag from "@/components/ui/Tag";
import ContactForm from "@/components/forms/ContactForm";
import JsonLd from "@/components/shared/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/schema";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description:
    "Get a free audit from Shoaib Nabi Noor — tell me what you're running, and I'll tell you what I'd fix first. Email, WhatsApp, or the form below.",
  path: "/contact",
});

const channels = [
  {
    icon: Mail,
    title: "Email",
    detail: "hello@adsbyshoaib.com",
    note: "Replies within 24 hours on working days",
    href: "mailto:hello@adsbyshoaib.com",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    detail: "+92 301 7461642",
    note: "Quickest for short questions",
    href: "https://wa.me/923017461642",
  },
  {
    icon: CalendarClock,
    title: "Book a call",
    detail: "30-minute audit call",
    note: "Calendar link goes live soon — use the form meanwhile",
    href: null,
  },
];

export default function ContactPage() {
  return (
    <PageWrapper>
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <section className="py-20 md:py-28">
        <div className="container-narrow">
          <Reveal>
            <Tag>Contact</Tag>
            <h1 className="font-serif italic text-hero mt-8 max-w-3xl">
              Start with the free audit<span className="text-citrus">.</span>
            </h1>
            <p className="text-body-lg text-ink-muted mt-6 max-w-2xl">
              Tell me what you're running — I'll look at it and tell you what I'd fix
              first. You'll leave with clarity either way, whether we work together or not.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pb-24 md:pb-32">
        <div className="container-wide grid grid-cols-1 lg:grid-cols-5 gap-10">
          {/* Channels + practical info */}
          <div className="lg:col-span-2 space-y-5">
            {channels.map((ch, i) => {
              const Inner = (
                <>
                  <ch.icon className="size-6 text-cobalt shrink-0" aria-hidden />
                  <div>
                    <h2 className="text-body-lg font-semibold">{ch.title}</h2>
                    <p className="text-body mt-1">{ch.detail}</p>
                    <p className="text-small text-ink-subtle mt-1">{ch.note}</p>
                  </div>
                </>
              );
              return (
                <Reveal key={ch.title} delay={i * 0.06}>
                  {ch.href ? (
                    <a
                      href={ch.href}
                      target={ch.href.startsWith("http") ? "_blank" : undefined}
                      rel={ch.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="flex gap-5 items-start bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-7 transition-all duration-300 hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/40"
                    >
                      {Inner}
                    </a>
                  ) : (
                    <div className="flex gap-5 items-start bg-white/30 border border-dashed border-ink/15 rounded-2xl p-7">
                      {Inner}
                    </div>
                  )}
                </Reveal>
              );
            })}

            <Reveal delay={0.2}>
              <div className="border-t-2 border-citrus pt-6 mt-8 space-y-4">
                <p className="flex items-center gap-3 text-small text-ink-muted">
                  <MapPin className="size-4 text-cobalt shrink-0" aria-hidden />
                  Multan, Pakistan — working with clients worldwide, fully remote
                </p>
                <p className="flex items-center gap-3 text-small text-ink-muted">
                  <Clock className="size-4 text-cobalt shrink-0" aria-hidden />
                  Currently taking on new retainer and project clients
                </p>
              </div>
            </Reveal>
          </div>

          {/* Form */}
          <Reveal delay={0.1} className="lg:col-span-3">
            <div className="bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-8 md:p-10">
              <h2 className="font-serif italic text-h3">
                Or use the form<span className="text-citrus">.</span>
              </h2>
              <p className="text-small text-ink-muted mt-2 mb-8">
                The more you tell me, the sharper the audit.
              </p>
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </section>
    </PageWrapper>
  );
}
