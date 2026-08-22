/*
 * One-time migration: pushes the existing draft/placeholder content
 * (currently hardcoded in lib/*.ts and content/case-studies/*.mdx) into
 * Sanity documents, so Shoaib can actually edit something in the Studio.
 *
 * Run with: npm run migrate:sanity
 * Safe to re-run — every document uses a deterministic ID via
 * createOrReplace(), so running it twice updates in place rather than
 * duplicating.
 */
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { createClient } from "@sanity/client";
import type { PortableTextBlock } from "next-sanity";

import { fallbackServices } from "../lib/services";
import { fallbackFaqs } from "../lib/faq";
import { fallbackTestimonials } from "../lib/testimonials";
import { fallbackPosts } from "../lib/posts";
import { primaryRoles, remoteProjects } from "../lib/experience";
import {
  summary,
  keyMetrics,
  technicalSkillGroups,
  softSkillGroups,
  languages,
  education,
  certifications,
} from "../lib/resume";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_TOKEN;

if (!projectId || !token) {
  console.error(
    "Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_TOKEN in .env.local"
  );
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: "2025-01-01",
  useCdn: false,
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ── Minimal Markdown -> Portable Text converter ──────────────
// Handles exactly the subset used in content/case-studies/*.mdx:
// "## " headings, "> " blockquotes, "- " bullet lists, blank-line-
// separated paragraphs. Good enough for placeholder content that
// Shoaib will rewrite in the Studio anyway.

let blockKeyCounter = 0;
const nextBlockKey = () => `b${blockKeyCounter++}`;

/** Strips bold/italic markdown markers rather than converting them to
 *  marks — good enough for placeholder content Shoaib will rewrite. */
function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "$1");
}

function textBlock(
  text: string,
  style: "normal" | "h2" | "blockquote" = "normal"
): PortableTextBlock {
  const key = nextBlockKey();
  return {
    _type: "block",
    _key: key,
    style,
    children: [{ _type: "span", _key: `${key}-s`, text: stripInlineMarkdown(text), marks: [] }],
    markDefs: [],
  };
}

function listItemBlock(text: string): PortableTextBlock {
  const key = nextBlockKey();
  return {
    _type: "block",
    _key: key,
    style: "normal",
    listItem: "bullet",
    level: 1,
    children: [{ _type: "span", _key: `${key}-s`, text: stripInlineMarkdown(text), marks: [] }],
    markDefs: [],
  } as PortableTextBlock;
}

function markdownToPortableText(markdown: string): PortableTextBlock[] {
  const lines = markdown.split("\n");
  const blocks: PortableTextBlock[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      blocks.push(textBlock(line.slice(3).trim(), "h2"));
    } else if (line.startsWith("> ")) {
      blocks.push(textBlock(line.slice(2).trim(), "blockquote"));
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push(listItemBlock(line.slice(2).trim()));
    } else {
      blocks.push(textBlock(line));
    }
  }

  return blocks;
}

async function migrateServices() {
  console.log(`\n— Services (${fallbackServices.length}) —`);
  for (const [index, service] of fallbackServices.entries()) {
    await client.createOrReplace({
      _id: `service-${service.slug}`,
      _type: "service",
      title: service.title,
      slug: { _type: "slug", current: service.slug },
      order: index,
      tagline: service.tagline,
      summary: service.summary,
      description: service.description,
      deliverables: service.deliverables,
      bestFor: service.bestFor,
    });
    console.log(`  ✓ ${service.title}`);
  }
}

async function migrateCaseStudies() {
  const dir = path.join(process.cwd(), "content", "case-studies");
  if (!fs.existsSync(dir)) {
    console.log("\n— Case studies — none found, skipping");
    return;
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
  console.log(`\n— Case studies (${files.length}) —`);

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const { data, content } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
    await client.createOrReplace({
      _id: `caseStudy-${slug}`,
      _type: "caseStudy",
      title: data.title,
      slug: { _type: "slug", current: slug },
      industry: data.industry,
      client: data.client,
      excerpt: data.excerpt,
      outcome: data.outcome,
      publishedAt: new Date(data.publishedAt).toISOString(),
      body: markdownToPortableText(content),
    });
    console.log(`  ✓ ${data.client}`);
  }
}

async function migratePosts() {
  console.log(`\n— Blog posts (${fallbackPosts.length}) —`);
  for (const post of fallbackPosts) {
    await client.createOrReplace({
      _id: `post-${post.slug}`,
      _type: "post",
      title: post.title,
      slug: { _type: "slug", current: post.slug },
      excerpt: post.excerpt,
      category: post.category,
      publishedAt: new Date(post.publishedAt).toISOString(),
      body: post.body,
    });
    console.log(`  ✓ ${post.title}`);
  }
}

async function migrateFaqs() {
  console.log(`\n— FAQs (${fallbackFaqs.length}) —`);
  for (const [index, faq] of fallbackFaqs.entries()) {
    await client.createOrReplace({
      _id: `faq-${index}`,
      _type: "faqItem",
      question: faq.q,
      answer: faq.a,
      order: index,
    });
    console.log(`  ✓ ${faq.q}`);
  }
}

async function migrateTestimonials() {
  console.log(`\n— Testimonials (${fallbackTestimonials.length}) —`);
  for (const [index, t] of fallbackTestimonials.entries()) {
    await client.createOrReplace({
      _id: `testimonial-${index}`,
      _type: "testimonial",
      headline: t.headline,
      quote: t.quote,
      author: t.author,
      context: t.context,
      order: index,
    });
    console.log(`  ✓ ${t.headline}`);
  }
}

async function migrateResumeRoles() {
  console.log(`\n— Resume primary roles (${primaryRoles.length}) —`);
  for (const [index, role] of primaryRoles.entries()) {
    await client.createOrReplace({
      _id: `resumeRole-${slugify(role.company)}`,
      _type: "resumeRole",
      company: role.company,
      location: role.location,
      role: role.role,
      order: index,
      stints: role.stints.map((s) => ({ _type: "stint", _key: nextBlockKey(), ...s })),
      overview: role.overview,
      managedLabel: role.managedLabel,
      managed: role.managed,
      contributions: role.contributions,
      note: role.note,
    });
    console.log(`  ✓ ${role.company}`);
  }
}

async function migrateResumeProjects() {
  console.log(`\n— Resume remote/client projects (${remoteProjects.length}) —`);
  for (const [index, project] of remoteProjects.entries()) {
    await client.createOrReplace({
      _id: `resumeProject-${slugify(project.company)}`,
      _type: "resumeProject",
      company: project.company,
      role: project.role,
      order: index,
      period: project.period,
      overview: project.overview,
      services: project.services,
      note: project.note,
    });
    console.log(`  ✓ ${project.company}`);
  }
}

async function migrateResumePage() {
  console.log("\n— Resume page content —");
  await client.createOrReplace({
    _id: "resumePage",
    _type: "resumePage",
    summary,
    metrics: keyMetrics.map((m) => ({ _type: "metric", _key: nextBlockKey(), ...m })),
    techSkillGroups: technicalSkillGroups.map((g) => ({
      _type: "skillGroup",
      _key: nextBlockKey(),
      ...g,
    })),
    softSkillGroups: softSkillGroups.map((g) => ({
      _type: "softSkillGroup",
      _key: nextBlockKey(),
      ...g,
    })),
    languages: languages.map((l) => ({ _type: "language", _key: nextBlockKey(), ...l })),
    education: education.map((e) => ({
      _type: "educationEntry",
      _key: nextBlockKey(),
      ...e,
    })),
    certifications: certifications.map((c) => ({
      _type: "certification",
      _key: nextBlockKey(),
      ...c,
    })),
  });
  console.log("  ✓ Summary, metrics, skills, languages, education, certifications");
}

async function main() {
  console.log(`Migrating draft content into Sanity project ${projectId} (${dataset})...`);

  await migrateServices();
  await migrateCaseStudies();
  await migratePosts();
  await migrateFaqs();
  await migrateTestimonials();
  await migrateResumeRoles();
  await migrateResumeProjects();
  await migrateResumePage();

  console.log("\nDone. Open /studio to review and edit.");
}

main().catch((error) => {
  console.error("\nMigration failed:", error);
  process.exit(1);
});
