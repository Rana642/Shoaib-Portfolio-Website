import { defineField, defineType } from "sanity";

export default defineType({
  name: "resumeProject",
  title: "Resume — Remote/Client Project",
  type: "document",
  fields: [
    defineField({
      name: "company",
      title: "Client / Company",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "role",
      title: "Role / Engagement Type",
      type: "string",
      description: "e.g. \"Full-Stack Digital Marketing\" — \"Remote\" context is implied by the section.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Display Order",
      type: "number",
      initialValue: 0,
    }),
    defineField({
      name: "period",
      title: "Period",
      type: "string",
      description: "Optional, e.g. \"Aug 2023 — Present\" or \"Ongoing\".",
    }),
    defineField({
      name: "overview",
      title: "Client Overview",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "url",
      title: "Website URL",
      type: "url",
    }),
    defineField({
      name: "services",
      title: "Services Delivered",
      type: "array",
      of: [{ type: "text", rows: 2 }],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "note",
      title: "Note",
      type: "text",
      rows: 2,
    }),
  ],
  orderings: [
    { title: "Display Order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
  ],
  preview: {
    select: { title: "company", subtitle: "role" },
  },
});
