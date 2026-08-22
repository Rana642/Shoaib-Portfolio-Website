import { defineConfig } from "sanity";
import { structureTool, type StructureBuilder } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { apiVersion, dataset, projectId } from "./lib/sanity/env";
import { schemaTypes } from "./sanity/schemaTypes";

/**
 * Sidebar layout: one section per content area, with the Resume page
 * content pinned as a singleton (one document, fixed ID) so Shoaib can't
 * accidentally create duplicates of it.
 */
const structure = (S: StructureBuilder) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Blog Posts")
        .schemaType("post")
        .child(S.documentTypeList("post").title("Blog Posts")),
      S.listItem()
        .title("Case Studies")
        .schemaType("caseStudy")
        .child(S.documentTypeList("caseStudy").title("Case Studies")),
      S.listItem()
        .title("Services")
        .schemaType("service")
        .child(S.documentTypeList("service").title("Services")),
      S.listItem()
        .title("Testimonials")
        .schemaType("testimonial")
        .child(S.documentTypeList("testimonial").title("Testimonials")),
      S.listItem()
        .title("FAQs")
        .schemaType("faqItem")
        .child(S.documentTypeList("faqItem").title("FAQs")),
      S.divider(),
      S.listItem()
        .title("Resume — Page Content")
        .child(
          S.document().schemaType("resumePage").documentId("resumePage").title("Resume — Page Content")
        ),
      S.listItem()
        .title("Resume — Primary Roles")
        .schemaType("resumeRole")
        .child(S.documentTypeList("resumeRole").title("Primary Roles")),
      S.listItem()
        .title("Resume — Remote/Client Projects")
        .schemaType("resumeProject")
        .child(S.documentTypeList("resumeProject").title("Remote/Client Projects")),
    ]);

export default defineConfig({
  name: "adsbyshoaib",
  title: "Ads by Shoaib — Studio",
  projectId,
  dataset,
  basePath: "/studio",
  plugins: [structureTool({ structure }), visionTool({ defaultApiVersion: apiVersion })],
  schema: { types: schemaTypes },
});
