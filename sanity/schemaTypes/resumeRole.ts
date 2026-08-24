import { defineField, defineType } from "sanity";

export default defineType({
  name: "resumeRole",
  title: "Resume — Primary Role",
  type: "document",
  fields: [
    defineField({
      name: "active",
      title: "Active (shown on site)",
      type: "boolean",
      initialValue: true,
      description: "Turn off to hide this role from the public Resume page without deleting it.",
    }),
    defineField({
      name: "company",
      title: "Company",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
    }),
    defineField({
      name: "role",
      title: "Role / Job Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "order",
      title: "Display Order",
      type: "number",
      initialValue: 0,
      description: "Lower numbers appear first (most recent role = 0).",
    }),
    defineField({
      name: "stints",
      title: "Stints",
      type: "array",
      of: [
        {
          type: "object",
          name: "stint",
          fields: [
            defineField({ name: "period", title: "Period", type: "string" }),
            defineField({ name: "note", title: "Note", type: "string" }),
          ],
          preview: { select: { title: "period", subtitle: "note" } },
        },
      ],
      description: "One entry per employment period, e.g. \"Jul 2025 — Present\".",
    }),
    defineField({
      name: "overview",
      title: "Company Overview",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "managedLabel",
      title: "Managed-List Label",
      type: "string",
      description: "Heading for the list below, e.g. \"Brands managed\" or \"Product categories\".",
    }),
    defineField({
      name: "managed",
      title: "Managed Items",
      description:
        "Each brand/property gets its own name, one-line note, and an optional link — never guess a link, leave it blank until confirmed.",
      type: "array",
      of: [
        {
          type: "object",
          name: "managedItem",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "note", title: "Note", type: "string" }),
            defineField({ name: "url", title: "URL", type: "url" }),
          ],
          preview: { select: { title: "name", subtitle: "note" } },
        },
      ],
    }),
    defineField({
      name: "contributions",
      title: "Key Contributions",
      type: "array",
      of: [{ type: "text", rows: 2 }],
    }),
    defineField({
      name: "note",
      title: "Scope Note",
      type: "text",
      rows: 2,
    }),
  ],
  orderings: [
    { title: "Display Order", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
  ],
  preview: {
    select: { title: "role", subtitle: "company", active: "active" },
    prepare({ title, subtitle, active }) {
      return { title: active === false ? `${title} (inactive)` : title, subtitle };
    },
  },
});
