import { defineField, defineType } from "sanity";

export default defineType({
  name: "caseStudy",
  title: "Case Study",
  type: "document",
  fields: [
    defineField({
      name: "active",
      title: "Active (shown on site)",
      type: "boolean",
      initialValue: true,
      description:
        "Turn off to hide this case study from the public site without deleting it. Hides it from the case studies list and makes its detail page 404.",
    }),
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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "industry",
      title: "Industry",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "client",
      title: "Client",
      type: "string",
      description: "Client name as shown on the card, e.g. \"Boutique Hotel — Multan\"",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "excerpt",
      title: "Excerpt",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.required().max(220),
    }),
    defineField({
      name: "outcome",
      title: "Outcome",
      type: "string",
      description: "The headline result, e.g. \"+300% direct bookings\"",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "coverImage",
      title: "Cover Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "body",
      title: "Body",
      type: "array",
      of: [{ type: "block" }, { type: "image", options: { hotspot: true } }],
      description: "The full case study — challenge, what was done, results.",
    }),
  ],
  preview: {
    select: { title: "client", subtitle: "outcome", media: "coverImage", active: "active" },
    prepare({ title, subtitle, media, active }) {
      return {
        title: active === false ? `${title} (inactive)` : title,
        subtitle,
        media,
      };
    },
  },
});
