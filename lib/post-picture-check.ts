import "server-only";
import { db } from "./dashboard/db";
import { getScheduledPost } from "./scheduled-posts";
import { fetchObject } from "./storage";

/**
 * Picture guard. There is no separate AI call and no extra cost: this builds a
 * one-shot brief (the picture itself, the project's official NAP, its graphic
 * rules and the house checklist) so the Claude session reading it compares the
 * picture against the official facts. Nothing is changed or flagged here.
 */

const CHECKLIST = [
  "NAP: every name, phone number, address and email visible in the picture matches the NAP below, character by character. Mismatch or a number that is not in the NAP = FIX.",
  "Spelling and grammar of EVERY word in the picture (headline, badge, button, small print), English and Urdu. Read the small text too.",
  "Logo: it is this project's logo; no other brand's or a partner's logo unless the brand rules allow it.",
  "Right project and place: no other city, brand or project name anywhere (e.g. a gate photo naming another city).",
  "Date and occasion: Jummah/occasion posts on their day; no claim or offer that is not in the KB.",
  "Imagery that suits the audience; no stock photo shown as the client's own place or product.",
  "Layout: text not cut off or overlapping, readable contrast, nothing important near the edges.",
];

export async function pictureCheckBrief(postId: string) {
  const post = await getScheduledPost(postId);
  if (!post) throw new Error(`No post found with id '${postId}'.`);

  const isVideo = post.post_type === "reel" || post.post_type === "video" || /\.(mp4|mov)$/i.test(post.media_key);
  const imageKey = isVideo ? post.cover_key : post.media_key;

  const [{ data: project }, { data: docs }, image] = await Promise.all([
    db.from("client_projects").select("name, clients(name)").eq("id", post.project_id).maybeSingle(),
    db.from("project_knowledge_docs").select("doc_type, title, content").eq("project_id", post.project_id).in("doc_type", ["nap", "graphic_rules"]),
    imageKey ? fetchObject(imageKey) : Promise.resolve(null),
  ]);

  const p = project as { name: string; clients: { name: string } | { name: string }[] | null } | null;
  const clientName = Array.isArray(p?.clients) ? p?.clients[0]?.name : p?.clients?.name;
  const rows = (docs ?? []) as { doc_type: string; title: string; content: string }[];
  const nap = rows.find((d) => d.doc_type === "nap");
  const rules = rows.find((d) => d.doc_type === "graphic_rules");

  const lines = [
    `Picture check — ${clientName ?? "?"} — ${p?.name ?? "?"} (${post.original_filename})`,
    isVideo && !image ? "This post is a video with no cover image: nothing to read. Ask what it shows." : "",
    "",
    "Read the picture below and go through the checklist. Do not change anything yourself: report each problem as FIX (wrong, must change) or CHECK (unsure), then flag FIX ones with social_request_changes (English + Roman Urdu).",
    "",
    "CHECKLIST",
    ...CHECKLIST.map((c, i) => `${i + 1}. ${c}`),
    "",
    nap ? `OFFICIAL NAP (${nap.title})\n${nap.content}` : "OFFICIAL NAP: none saved for this project. Get it from the brand's official website (never from product PDFs), save it with kb_upsert_doc(docType=\"nap\"), then check. Until then NAP is CHECK, not verified.",
    "",
    rules ? `PROJECT GRAPHIC RULES (${rules.title})\n${rules.content}` : "PROJECT GRAPHIC RULES: none saved.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === ""));

  return {
    text: lines.join("\n"),
    image: image ? { data: image.buffer.toString("base64"), mimeType: image.contentType } : null,
  };
}
