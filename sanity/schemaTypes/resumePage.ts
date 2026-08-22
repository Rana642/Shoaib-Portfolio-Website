import { defineField, defineType } from "sanity";

/**
 * Singleton — one document holds the Resume page's non-experience content
 * (summary, metrics, skills, languages, education, certifications).
 * Experience lives in resumeRole / resumeProject documents.
 */
export default defineType({
  name: "resumePage",
  title: "Resume — Page Content",
  type: "document",
  fields: [
    defineField({
      name: "summary",
      title: "Professional Summary",
      type: "text",
      rows: 6,
    }),
    defineField({
      name: "metrics",
      title: "Key Career Metrics",
      type: "array",
      of: [
        {
          type: "object",
          name: "metric",
          fields: [
            defineField({ name: "value", title: "Value", type: "string" }),
            defineField({ name: "label", title: "Label", type: "string" }),
          ],
          preview: { select: { title: "value", subtitle: "label" } },
        },
      ],
    }),
    defineField({
      name: "techSkillGroups",
      title: "Core Technical Skills",
      type: "array",
      of: [
        {
          type: "object",
          name: "skillGroup",
          fields: [
            defineField({ name: "category", title: "Category", type: "string" }),
            defineField({
              name: "items",
              title: "Skills",
              type: "array",
              of: [{ type: "string" }],
            }),
          ],
          preview: { select: { title: "category" } },
        },
      ],
    }),
    defineField({
      name: "softSkillGroups",
      title: "Soft Skills",
      type: "array",
      of: [
        {
          type: "object",
          name: "softSkillGroup",
          fields: [
            defineField({ name: "category", title: "Category", type: "string" }),
            defineField({
              name: "items",
              title: "Skills",
              type: "array",
              of: [{ type: "string" }],
            }),
          ],
          preview: { select: { title: "category" } },
        },
      ],
    }),
    defineField({
      name: "languages",
      title: "Languages",
      type: "array",
      of: [
        {
          type: "object",
          name: "language",
          fields: [
            defineField({ name: "name", title: "Language", type: "string" }),
            defineField({ name: "level", title: "Proficiency", type: "string" }),
          ],
          preview: { select: { title: "name", subtitle: "level" } },
        },
      ],
    }),
    defineField({
      name: "education",
      title: "Education",
      type: "array",
      of: [
        {
          type: "object",
          name: "educationEntry",
          fields: [
            defineField({ name: "degree", title: "Degree", type: "string" }),
            defineField({ name: "institution", title: "Institution", type: "string" }),
            defineField({ name: "period", title: "Period / Result", type: "string" }),
          ],
          preview: { select: { title: "degree", subtitle: "institution" } },
        },
      ],
    }),
    defineField({
      name: "certifications",
      title: "Certifications",
      type: "array",
      of: [
        {
          type: "object",
          name: "certification",
          fields: [
            defineField({ name: "title", title: "Title", type: "string" }),
            defineField({ name: "issuer", title: "Issuer", type: "string" }),
            defineField({ name: "detail", title: "Detail", type: "string" }),
            defineField({ name: "note", title: "Note", type: "text", rows: 2 }),
          ],
          preview: { select: { title: "title", subtitle: "issuer" } },
        },
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Resume — Page Content" }),
  },
});
