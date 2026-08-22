import { defineField, defineType } from "sanity";

export default defineType({
  name: "testimonial",
  title: "Testimonial",
  type: "document",
  fields: [
    defineField({
      name: "headline",
      title: "Headline",
      type: "string",
      description: "The attention line, e.g. \"Direct bookings tripled in one quarter\"",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "quote",
      title: "Quote",
      type: "text",
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "author",
      title: "Author",
      type: "string",
      description: "e.g. \"Owner, boutique hotel\" or a full name with permission",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "context",
      title: "Context",
      type: "string",
      description: "Industry/location line, e.g. \"Hospitality — Multan\"",
    }),
    defineField({
      name: "order",
      title: "Display Order",
      type: "number",
      initialValue: 0,
    }),
  ],
  orderings: [
    { title: "Display Order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
  ],
  preview: {
    select: { title: "headline", subtitle: "author" },
  },
});
