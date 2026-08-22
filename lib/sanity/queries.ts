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
  *[_type == "caseStudy"] | order(publishedAt desc) {
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
  *[_type == "caseStudy" && slug.current == $slug][0] {
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

export const resumeRolesQuery = groq`
  *[_type == "resumeRole"] | order(order asc) {
    company,
    location,
    role,
    stints[] { period, note },
    overview,
    managedLabel,
    managed,
    contributions,
    note
  }
`;

export const resumeProjectsQuery = groq`
  *[_type == "resumeProject"] | order(order asc) {
    company,
    role,
    period,
    overview,
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
