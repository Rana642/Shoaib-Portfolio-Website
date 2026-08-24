import { siteUrl, siteName } from "./seo";
import type { Service } from "./services";
import type { Post } from "./posts";
import type { CaseStudyMeta } from "./case-studies";

// Logo/sameAs are placeholders until Shoaib provides a final logo + social
// links (see PENDING ITEMS in CLAUDE-CODE-INSTRUCTIONS.md).
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    // Formerly operated under this name — kept here (schema.org's own
    // field for this) so Google's entity-resolution systems connect the
    // two, e.g. when converting the old Google Business Profile.
    alternateName: "Socially Snap",
    url: siteUrl,
    logo: `${siteUrl}/images/shoaib.png`,
    founder: { "@type": "Person", name: "Shoaib Nabi Noor" },
  };
}

export function personSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Shoaib Nabi Noor",
    url: `${siteUrl}/shoaib-nabi-noor`,
    image: `${siteUrl}/images/shoaib.png`,
    jobTitle: "Performance Marketing Specialist",
    worksFor: { "@type": "Organization", name: siteName },
  };
}

export function serviceSchema(service: Service) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.summary,
    url: `${siteUrl}/services/${service.slug}`,
    provider: { "@type": "Person", name: "Shoaib Nabi Noor" },
  };
}

export function articleSchema(post: Post) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    author: { "@type": "Person", name: "Shoaib Nabi Noor" },
    url: `${siteUrl}/blog/${post.slug}`,
  };
}

export function caseStudySchema(cs: CaseStudyMeta) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: cs.title,
    description: cs.excerpt,
    datePublished: cs.publishedAt,
    author: { "@type": "Person", name: "Shoaib Nabi Noor" },
    url: `${siteUrl}/case-studies/${cs.slug}`,
  };
}

export function faqPageSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}
