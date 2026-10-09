// Shared by server and client (template types, validation and preview rendering).

/** A message template as the inbox and the Templates page use it. */
export type WaTemplate = {
  id: string;
  name: string;
  language: string;
  category: string; // MARKETING | UTILITY | AUTHENTICATION
  status: string; // APPROVED | PENDING | REJECTED | PAUSED | DISABLED
  rejectedReason?: string | null;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons: { type: string; text: string; url?: string }[];
  /** How many {{n}} variables the body has. */
  vars: number;
  /** Can be sent from the inbox: text-only header and no variable link buttons (those need extra inputs we don't collect yet). */
  sendable: boolean;
};

export type TemplateInput = {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  header: string;
  body: string;
  /** Example value for each {{n}} in the body (Meta requires them for review). */
  examples: string[];
  footer: string;
  quickReplies: string[];
  urlButton: { text: string; url: string } | null;
};

export const TEMPLATE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
] as const;

/** Highest {{n}} used in a text (Meta needs them numbered 1..n with no gaps). */
export function countVars(text: string) {
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/** {{1}} → params[0] … (an empty param shows the placeholder). */
export function fillVars(text: string, params: string[]) {
  return text.replace(/\{\{(\d+)\}\}/g, (all, n) => params[Number(n) - 1]?.trim() || all);
}

/** Meta's rules, checked before we send it for review. Returns an error or null. */
export function validateTemplate(t: TemplateInput): string | null {
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) return "Name: lowercase letters, numbers and _ only (e.g. booking_reminder).";
  if (!t.body.trim()) return "Write the message body.";
  if (t.body.length > 1024) return "Body is too long (1,024 characters max).";
  if (t.header.length > 60) return "Header is too long (60 characters max).";
  if (/\{\{/.test(t.header)) return "Variables aren't supported in the header here — keep it plain text.";
  if (t.footer.length > 60) return "Footer is too long (60 characters max).";
  const nums = [...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const n = countVars(t.body);
  for (let i = 1; i <= n; i++) if (!nums.includes(i)) return `Variables must be numbered in order — {{${i}}} is missing.`;
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) return "The body can't start or end with a variable — add some words around it.";
  for (let i = 0; i < n; i++) if (!t.examples[i]?.trim()) return `Give an example for {{${i + 1}}} — Meta needs it to review the template.`;
  if (t.quickReplies.filter((q) => q.trim()).length > 3) return "Up to 3 quick-reply buttons.";
  if (t.quickReplies.some((q) => q.length > 25)) return "Button text is 25 characters max.";
  if (t.urlButton && (!t.urlButton.text.trim() || !/^https:\/\/\S+$/.test(t.urlButton.url))) return "The link button needs text and a full https:// address.";
  return null;
}
