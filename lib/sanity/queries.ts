import { groq } from "next-sanity";

// ── Blog ──

export const allPostsQuery = groq`
  *[_type == "post"] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    excerpt,
    category,
    publishedAt,
    body,
    "coverImage": coverImage.asset->url
  }
`;

export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    excerpt,
    category,
    publishedAt,
    body,
    "coverImage": coverImage.asset->url,
    faqs
  }
`;

// ── Case Studies ──

export const allCaseStudiesQuery = groq`
  *[_type == "caseStudy" && active != false] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    industry,
    client,
    excerpt,
    outcome,
    publishedAt,
    "coverImage": coverImage.asset->url
  }
`;

export const caseStudyBySlugQuery = groq`
  *[_type == "caseStudy" && slug.current == $slug && active != false][0] {
    "slug": slug.current,
    title,
    industry,
    client,
    excerpt,
    outcome,
    publishedAt,
    "coverImage": coverImage.asset->url,
    body
  }
`;

// ── Services ──

export const allServicesQuery = groq`
  *[_type == "service"] | order(order asc) {
    "slug": slug.current,
    title,
    tagline,
    summary,
    description,
    deliverables,
    bestFor
  }
`;

export const serviceBySlugQuery = groq`
  *[_type == "service" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    tagline,
    summary,
    description,
    deliverables,
    bestFor
  }
`;

// ── Testimonials / FAQs ──

export const testimonialsQuery = groq`
  *[_type == "testimonial"] | order(order asc) {
    headline,
    quote,
    author,
    context
  }
`;

export const faqsQuery = groq`
  *[_type == "faqItem"] | order(order asc) {
    "q": question,
    "a": answer
  }
`;

// ── Resume ──

// Not filtered by "active" here — an empty result must mean "Sanity has no
// documents of this type yet" (falls back to hardcoded data in
// lib/experience.ts), not "every document is inactive" (should stay empty).
// The active filter is applied in the getter instead.
export const resumeRolesQuery = groq`
  *[_type == "resumeRole"] | order(order asc) {
    company,
    location,
    role,
    active,
    stints[] { period, note },
    overview,
    managedLabel,
    managed[] { name, note, url },
    contributions,
    note
  }
`;

export const resumeProjectsQuery = groq`
  *[_type == "resumeProject"] | order(order asc) {
    company,
    role,
    active,
    period,
    overview,
    url,
    services,
    note
  }
`;

export const resumePageQuery = groq`
  *[_type == "resumePage"][0] {
    summary,
    metrics[] { value, label },
    techSkillGroups[] { category, items },
    softSkillGroups[] { category, items },
    languages[] { name, level },
    education[] { degree, institution, period },
    certifications[] { title, issuer, detail, note }
  }
`;
