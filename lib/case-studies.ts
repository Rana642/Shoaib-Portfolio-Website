import fs from "fs";
import path from "path";
import matter from "gray-matter";

export type CaseStudyMeta = {
  slug: string;
  title: string;
  industry: string;
  client: string;
  excerpt: string;
  coverImage: string;
  outcome: string;
  publishedAt: string;
};

export type CaseStudy = CaseStudyMeta & { content: string };

const dir = path.join(process.cwd(), "content", "case-studies");

export function getAllCaseStudies(): CaseStudyMeta[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const { data } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      return { slug, ...(data as Omit<CaseStudyMeta, "slug">) };
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getCaseStudy(slug: string): CaseStudy | null {
  const file = path.join(dir, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  return { slug, ...(data as Omit<CaseStudyMeta, "slug">), content };
}
