import { defineField, defineType } from "sanity";

export default defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      description:
        "Existing slugs (meta-ads, google-ads, tracking-analytics, funnels-web) have matching icons on the site; new slugs get a default icon.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Display Order",
      type: "number",
      initialValue: 0,
      description: "Lower numbers appear first.",
    }),
    defineField({
      name: "tagline",
      title: "Tagline",
      type: "string",
      description: "Short punchy line, e.g. \"Own the moment of intent.\"",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "summary",
      title: "Summary",
      type: "text",
      rows: 2,
      description: "One-liner used on cards and the services index.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description Paragraphs",
      type: "array",
      of: [{ type: "text", rows: 3 }],
      description: "Longer paragraphs for the service detail page.",
    }),
    defineField({
      name: "deliverables",
      title: "What You Get (Deliverables)",
      type: "array",
      of: [{ type: "string" }],
    }),
    defineField({
      name: "bestFor",
      title: "Best For",
      type: "array",
      of: [{ type: "string" }],
    }),
  ],
  orderings: [
    {
      title: "Display Order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "tagline" },
  },
});
