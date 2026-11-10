import "server-only";
import { db } from "@/lib/dashboard/db";
import { deleteObject } from "@/lib/storage";
import { deleteScheduledPost, getScheduledPost, nativeDraftChangeable } from "@/lib/scheduled-posts";
import { cancelPostEverywhere, rescheduleNativePosts } from "@/lib/social-post";
import { checkCaption, type Finding } from "@/lib/post-preflight-checks";
import { fingerprintStored, hashDistance, SAME_LOOK_BITS } from "@/lib/media-fingerprint";
import { connectedPlatforms, updatePlannerPost } from "@/lib/planner-intake";
import { lengthProblem, planBulkDates, pktToday, pktTomorrow, takes } from "@/lib/planner-rules";
import type { PostType, ScheduledPost } from "@/lib/dashboard/types";

/**
 * The Planner audit (Shoaib, 2026-11-09): one button that checks a project's
 * planner against our rules after an upload, so nothing goes out twice and
 * nothing is left behind.
 *
 * - the same content twice (exact file or a picture that looks the same)
 * - Drive folder files that never made it onto the planner
 * - platforms that can't take a post (kind, video length) or aren't connected
 * - the Friday rule (Jummah posts on Fridays, nothing else there)
 * - two posts on one day, empty days in the run
 * - caption mistakes, posts waiting for a caption, missed and failed posts
 *
 * "Fix safe ones" applies only fixes that can't lose anything: dropping a
 * platform that can't take the post, and taking emoji out of a caption (the
 * words stay as approved). Removing, moving and importing are always the
 * user's click (or an explicit MCP call).
 */

export type AuditAction =
  | { type: "remove"; postId: string }
  | { type: "move"; postId: string; date: string }
  | { type: "fix-platforms"; postId: string; platforms: string[] }
  | { type: "strip-emoji"; postId: string }
  | { type: "open"; postId: string };

export type AuditItem = {
  key: string;
  severity: "fix" | "check" | "info";
  title: string;
  detail?: string;
  action?: AuditAction;
  /** Applied by "Fix safe ones" without asking. */
  safe?: boolean;
};

export type AuditResult = { items: AuditItem[]; checked: number; backfilled: number };

type Row = ScheduledPost & { media_md5?: string | null; media_phash?: string | null; media_seconds?: number | null; created_at?: string; claimed_until?: string | null };

const UPCOMING = new Set(["pending_caption", "needs_changes", "scheduled"]);
const FRIDAY_NAME = /friday|jumm?ah?\b|jumu'?ah/i;
const pktDate = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const kindOf = (p: Row): PostType => p.post_type ?? "post";
const label = (p: Row) => `${p.original_filename}${p.scheduled_at ? ` (${pktDate(p.scheduled_at)})` : ""}`;
const isFridayFile = (p: Row) => FRIDAY_NAME.test(p.original_filename);

// Emoji and what is left of them (variation selectors, joiners, skin tones, keycaps, flags).
const EMOJI_PARTS = /[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu;
/** The caption without emoji (house rule, 2026-11-02); the words stay exactly as approved. */
export function stripEmoji(caption: string): string {
  // A contact line keeps its meaning: the emoji becomes the label the global rule asks for.
  const labelled = caption
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*)(?:📞|☎️?|📱)️?\s*/u, "$1Call: ")
        .replace(/^(\s*)(?:📧|✉️?)️?\s*/u, "$1Email: ")
        .replace(/^(\s*)📍️?\s*/u, "$1Location: ")
        .replace(/^(\s*)(?:🌐|🔗)️?\s*/u, "$1Web: ")
    )
    .join("\n");
  return labelled
    .replace(EMOJI_PARTS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+|[ \t]+$/g, "").replace(/ +([,.!?:;])/g, "$1"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadRows(projectId: string): Promise<Row[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data, error } = await db
    .from("scheduled_posts")
    .select("*")
    .eq("project_id", projectId)
    .or(`status.in.(pending_caption,needs_changes,scheduled),created_at.gte.${since}`)
    .order("scheduled_at", { ascending: true })
    .limit(3000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Fingerprints for posts still to go out that don't have one yet (uploads from before), while their file is here. */
async function backfill(rows: Row[], budgetMs: number): Promise<number> {
  const started = Date.now();
  let n = 0;
  for (const p of rows) {
    if (Date.now() - started > budgetMs) break;
    if (!UPCOMING.has(p.status) || p.media_md5) continue;
    const fp = await fingerprintStored(p.media_key).catch(() => null);
    if (!fp?.md5) continue;
    const { error } = await db.from("scheduled_posts").update({ media_md5: fp.md5, ...(fp.phash ? { media_phash: fp.phash } : {}) }).eq("id", p.id);
    if (error) break; // columns not there yet
    p.media_md5 = fp.md5;
    p.media_phash = fp.phash;
    n++;
  }
  return n;
}

/** The post of a duplicate pair to remove: never a posted one; of two still to go out, the later one. */
function removable(a: Row, b: Row): Row | null {
  const aUp = UPCOMING.has(a.status);
  const bUp = UPCOMING.has(b.status);
  if (aUp && bUp) return (a.scheduled_at ?? "") > (b.scheduled_at ?? "") ? a : b;
  if (aUp) return a;
  if (bUp) return b;
  return null;
}

export async function auditPlanner(projectId: string): Promise<AuditResult> {
  const rows = await loadRows(projectId);
  const backfilled = await backfill(rows, 20_000);
  const connected = await connectedPlatforms(projectId);
  const items: AuditItem[] = [];
  const upcoming = rows.filter((p) => UPCOMING.has(p.status));
  const feed = (p: Row) => kindOf(p) !== "story";
  const today = pktToday();

  // Days already taken (feed posts still to go out), for moves and imports.
  const busy = new Set(upcoming.filter((p) => feed(p) && p.scheduled_at).map((p) => pktDate(p.scheduled_at!)));
  const takeDay = (fridayFile: boolean) => {
    const day = planBulkDates([fridayFile ? "friday" : "post"], pktTomorrow(), busy)[0];
    busy.add(day);
    return day;
  };

  // 1. The same content twice (feed with feed, Stories with Stories).
  const reported = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (feed(a) !== feed(b) || a.story_of_post_id === b.id || b.story_of_post_id === a.id) continue;
      const same = a.media_key === b.media_key || (a.media_md5 && a.media_md5 === b.media_md5);
      const looks = !same && a.media_phash && b.media_phash && hashDistance(a.media_phash, b.media_phash) <= SAME_LOOK_BITS;
      if (!same && !looks) continue;
      const drop = removable(a, b);
      if (!drop || reported.has(drop.id)) continue;
      reported.add(drop.id);
      const keep = drop === a ? b : a;
      items.push({
        key: `dup:${drop.id}`,
        severity: same ? "fix" : "check",
        title: same ? `Same file twice: ${label(drop)} and ${label(keep)}` : `Looks the same: ${label(drop)} and ${label(keep)}`,
        detail: `${keep.status === "posted" ? `${keep.original_filename} has already gone out.` : `Keep ${keep.original_filename}.`} Remove ${drop.original_filename}${same ? "" : " if it is a repeat"}.`,
        action: { type: "remove", postId: drop.id },
      });
    }
  }
  // Same name as an older post whose content can't be compared (before fingerprints, file gone).
  const legacyNames = upcoming.filter(
    (p) => p.media_md5 && rows.some((o) => o.id !== p.id && !o.media_md5 && feed(o) === feed(p) && o.original_filename.toLowerCase() === p.original_filename.toLowerCase())
  );
  if (legacyNames.length) {
    items.push({
      key: "legacy-names",
      severity: "info",
      title: `${legacyNames.length} post(s) share a name with an older post`,
      detail: `The older files are gone, so the content can't be compared: ${legacyNames.map((p) => p.original_filename).join(", ")}. A quick look is enough.`,
    });
  }

  // (A Drive folder is checked right after its import, in the Bulk upload: lib/planner-drive.ts verifyDriveImport.)

  // 3. Platforms: each one can take the post; length fits; still connected.
  for (const p of upcoming) {
    const kind = kindOf(p);
    const seconds = p.media_seconds ?? null;
    if (p.target_platforms === null) {
      if (connected.length && !connected.some((x) => takes(kind, x))) {
        items.push({ key: `plat:${p.id}`, severity: "fix", title: `No connected platform takes ${label(p)}`, detail: `Connected: ${connected.join(", ")}.`, action: { type: "open", postId: p.id } });
      }
      continue;
    }
    const wrong = p.target_platforms.filter((x) => !takes(kind, x) || lengthProblem(kind, x, seconds));
    const gone = p.target_platforms.filter((x) => !wrong.includes(x) && !connected.includes(x));
    if (wrong.length) {
      const keep = p.target_platforms.filter((x) => !wrong.includes(x));
      const why = wrong.map((x) => lengthProblem(kind, x, seconds) ?? `${x} can't take this kind of post`).join(" ");
      items.push(
        keep.length
          ? { key: `plat:${p.id}`, severity: "fix", title: `Wrong platform on ${label(p)}`, detail: `${why} Fix removes ${wrong.join(", ")}.`, action: { type: "fix-platforms", postId: p.id, platforms: keep }, safe: true }
          : { key: `plat:${p.id}`, severity: "fix", title: `No platform can take ${label(p)}`, detail: why, action: { type: "open", postId: p.id } }
      );
    }
    if (gone.length) {
      items.push({ key: `gone:${p.id}`, severity: "check", title: `Not connected now: ${gone.join(", ")} on ${label(p)}`, detail: "Reconnect it before the post's time, or it is skipped there." });
    }
  }

  // 4 + 5. Days: the Friday rule, two posts on a day, empty days in the run (feed posts still to go out).
  const byDay = new Map<string, Row[]>();
  for (const p of upcoming) {
    if (!feed(p) || !p.scheduled_at) continue;
    const d = pktDate(p.scheduled_at);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  }
  for (const [day, list] of byDay) {
    if (day < today) continue;
    const friday = weekday(day) === 5;
    for (const p of list) {
      if (friday && !isFridayFile(p)) {
        items.push({ key: `fri:${p.id}`, severity: "check", title: `${label(p)} is on a Friday`, detail: "Fridays are kept for the Jummah post. Move it to the next free day?", action: { type: "move", postId: p.id, date: takeDay(false) } });
      } else if (!friday && isFridayFile(p)) {
        items.push({ key: `fri:${p.id}`, severity: "check", title: `${label(p)} is a Friday post on a ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(day)]}`, detail: "Move it to the next free Friday?", action: { type: "move", postId: p.id, date: takeDay(true) } });
      }
    }
    if (list.length > 1) {
      const extra = list.slice(1);
      for (const p of extra) {
        if (items.some((x) => x.key === `fri:${p.id}`)) continue;
        items.push({ key: `day:${p.id}`, severity: "check", title: `Two posts on ${day}: ${list.map((x) => x.original_filename).join(", ")}`, detail: `Move ${p.original_filename} to the next free day?`, action: { type: "move", postId: p.id, date: takeDay(isFridayFile(p)) } });
      }
    }
  }
  const days = [...byDay.keys()].filter((d) => d >= today).sort();
  if (days.length > 1) {
    const empty: string[] = [];
    const emptyFridays: string[] = [];
    for (let d = days[0]; d < days[days.length - 1]; d = addDays(d, 1)) {
      if (byDay.has(d)) continue;
      (weekday(d) === 5 ? emptyFridays : empty).push(d);
    }
    if (empty.length) items.push({ key: "gaps", severity: "info", title: `${empty.length} day(s) without a post`, detail: empty.join(", ") });
    if (emptyFridays.length) items.push({ key: "fri-gaps", severity: "check", title: `${emptyFridays.length} Friday(s) without a Jummah post`, detail: emptyFridays.join(", ") });
  }

  // 6. Captions and posts that should already be out.
  const waiting = upcoming.filter((p) => p.status === "pending_caption");
  if (waiting.length) items.push({ key: "captions", severity: "info", title: `${waiting.length} post(s) wait for a caption`, detail: waiting.map(label).join(", ") });
  const held = upcoming.filter((p) => p.status === "needs_changes");
  if (held.length) items.push({ key: "held", severity: "info", title: `${held.length} post(s) held for changes`, detail: held.map((p) => `${label(p)}${p.review_note ? `: ${p.review_note}` : ""}`).join("; ") });
  for (const p of upcoming) {
    if (p.status !== "scheduled") continue;
    const fixes = kindOf(p) === "story" ? [] : checkCaption(p.caption ?? "").filter((f: Finding) => f.severity === "fix");
    if (fixes.length) {
      // Emoji alone can be taken out without touching a word; anything else needs a look.
      const onlyEmoji = fixes.every((f) => /emoji/i.test(f.code) || /emoji/i.test(f.en));
      items.push(
        onlyEmoji
          ? { key: `cap:${p.id}`, severity: "fix", title: `Emoji in the caption of ${label(p)}`, detail: `Fix takes the emoji out, the words stay: "${stripEmoji(p.caption ?? "").slice(0, 110)}…"`, action: { type: "strip-emoji", postId: p.id }, safe: true }
          : { key: `cap:${p.id}`, severity: "fix", title: `Caption mistake on ${label(p)}`, detail: fixes.map((f) => f.en).join(" "), action: { type: "open", postId: p.id } }
      );
    }
    const claimed = p.claimed_until && new Date(p.claimed_until).getTime() > Date.now();
    if (p.scheduled_at && !claimed && new Date(p.scheduled_at).getTime() < Date.now() - 30 * 60_000) {
      items.push({ key: `late:${p.id}`, severity: "fix", title: `Should have gone out: ${label(p)}`, detail: "Its time has passed and it is still waiting. Open it and use Publish now, or move it.", action: { type: "open", postId: p.id } });
    }
  }
  const weekAgo = Date.now() - 7 * 86400_000;
  for (const p of rows) {
    if (p.status === "failed" && p.scheduled_at && new Date(p.scheduled_at).getTime() > weekAgo) {
      items.push({ key: `failed:${p.id}`, severity: "check", title: `Failed: ${label(p)}`, detail: "It didn't go out. Retry it, or add it again.", action: { type: "open", postId: p.id } });
    }
  }

  const order = { fix: 0, check: 1, info: 2 } as const;
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  return { items, checked: rows.length, backfilled };
}

/** Removes a post that hasn't gone out: its Facebook draft first, then the post and its files. */
export async function removePlannerPost(postId: string, projectId: string): Promise<void> {
  const post = await getScheduledPost(postId);
  if (!post || post.project_id !== projectId) throw new Error("Post not found.");
  if (!UPCOMING.has(post.status)) throw new Error("This post has already gone out (or failed); it isn't removed from here.");
  await cancelPostEverywhere(postId);
  for (const key of [post.media_key, post.cover_key].filter((k): k is string => Boolean(k))) await deleteObject(key).catch(() => undefined);
  await deleteScheduledPost(postId);
}

/** Does one audit action (a click, or an MCP call). */
export async function applyAuditAction(projectId: string, action: AuditAction): Promise<string> {
  const own = async (postId: string) => {
    const post = await getScheduledPost(postId);
    if (!post || post.project_id !== projectId) throw new Error("Post not found.");
  };
  switch (action.type) {
    case "remove":
      await removePlannerPost(action.postId, projectId);
      return "Removed.";
    case "move":
      await own(action.postId);
      await updatePlannerPost({ postId: action.postId, date: action.date });
      return `Moved to ${action.date}.`;
    case "fix-platforms": {
      // Only drops platforms that can't take the post; a disconnected one stays (it may be reconnected).
      const post = await getScheduledPost(action.postId);
      if (!post || post.project_id !== projectId) throw new Error("Post not found.");
      if (!UPCOMING.has(post.status)) throw new Error("This post has already gone out.");
      const keep = action.platforms.filter((p) => post.target_platforms?.includes(p));
      if (!keep.length) throw new Error("No platform would be left. Open the post instead.");
      const native = ((post.result as { native?: { ok?: boolean; native?: boolean }[] } | null)?.native ?? []).filter((r) => r.ok && r.native);
      if (native.length && !nativeDraftChangeable(post)) throw new Error("Facebook already has this post and its time is close, so it isn't changed now.");
      const { error } = await db.from("scheduled_posts").update({ target_platforms: keep }).eq("id", post.id);
      if (error) throw new Error(error.message);
      if (post.status === "scheduled" && post.caption) await rescheduleNativePosts(post.id);
      return `Platforms now: ${keep.join(", ")}.`;
    }
    case "strip-emoji": {
      const post = await getScheduledPost(action.postId);
      if (!post || post.project_id !== projectId) throw new Error("Post not found.");
      if (!UPCOMING.has(post.status) || !post.caption) throw new Error("This post has no caption to fix, or has already gone out.");
      const native = ((post.result as { native?: { ok?: boolean; native?: boolean }[] } | null)?.native ?? []).filter((r) => r.ok && r.native);
      if (native.length && !nativeDraftChangeable(post)) throw new Error("Facebook already has this post and its time is close, so the caption isn't changed now.");
      const caption = stripEmoji(post.caption);
      if (!caption) throw new Error("Nothing would be left of the caption.");
      const { error } = await db.from("scheduled_posts").update({ caption }).eq("id", post.id);
      if (error) throw new Error(error.message);
      // A Facebook copy already handed to Meta gets the new words too.
      if (post.status === "scheduled" && native.length) await rescheduleNativePosts(post.id);
      return "Emoji taken out of the caption.";
    }
    case "open":
      return "Open it on the Planner.";
  }
}

/** "Fix safe ones": only the fixes that can't lose anything (a platform that can't take the post, emoji out of a caption). */
export async function fixSafeAuditItems(projectId: string, items: AuditItem[]): Promise<{ done: string[]; failed: string[] }> {
  const done: string[] = [];
  const failed: string[] = [];
  for (const item of items) {
    if (!item.safe || !item.action) continue;
    try {
      await applyAuditAction(projectId, item.action);
      done.push(item.title);
    } catch (error) {
      failed.push(`${item.title}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { done, failed };
}
