import "server-only";
import { db } from "./dashboard/db";
import { resend, isResendConfigured, fromEmail, toEmail } from "./resend";
import { siteUrl } from "./seo";

/**
 * One email every morning (from 8 AM PKT, first social-cron run after it)
 * with the whole Planner at a glance — Shoaib, 2026-10-30, after Facebook
 * posts had gone missing for days unnoticed. Plain code, no AI, no cost.
 *
 * - Kal: what went live per project (posts by platform, stories), what
 *   failed, what the Facebook check (lib/social-verify.ts) re-sent.
 * - Ruki hui: posts held because a login/connection is blocked.
 * - Aaj: what's still to go out today.
 * - Khaali din: days in the next week with no feed post while that project
 *   has posts waiting for a caption ("koi din khali nai jana chaiye agar
 *   posts available hain").
 * - Caption / client changes: what's waiting on us or on the client.
 *
 * Sent once per PKT day: check_rate_limit on "morning-report:<date>" claims
 * the day atomically (a failed send releases it for the next run).
 */

const PKT_MS = 5 * 3600_000;
const SEND_FROM_HOUR = 8;
const AHEAD_DAYS = 7;

type Row = {
  id: string;
  project_id: string;
  status: string;
  post_type: string;
  scheduled_at: string | null;
  created_at: string;
  original_filename: string;
  result: Record<string, unknown> | null;
  project: { name?: string } | null;
};
type Res = { platform: string; ok: boolean; error?: string; resent?: { at: string; why: string } };

const PLATFORM = { facebook: "FB", instagram: "IG", linkedin: "LinkedIn", google_business: "Google", tiktok: "TikTok", youtube: "YouTube" } as Record<string, string>;
const FEED = ["post", "reel", "video"];

/** PKT calendar day ("2026-10-31") of an instant. */
const pktDay = (ms: number) => new Date(ms + PKT_MS).toISOString().slice(0, 10);
/** UTC instant where a PKT day starts. */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - PKT_MS;
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" });
const nameOf = (r: Row) => r.project?.name ?? "Project";
const results = (r: Row): Res[] => {
  const res = r.result ?? {};
  const list = [...((res.platforms as Res[]) ?? []), ...((res.native as Res[]) ?? []), ...((res.live as Res[]) ?? [])];
  if (res.gbp) list.push(res.gbp as Res);
  return list;
};
const firstError = (r: Row) =>
  String((r.result?.held as { error?: string } | undefined)?.error ?? results(r).find((p) => !p.ok)?.error ?? (r.result?.error as string | undefined) ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 140);

const select = "id, project_id, status, post_type, scheduled_at, created_at, original_filename, result, project:client_projects(name)";

/** Builds the report for the PKT day containing `now`. */
export async function buildMorningReport(now = Date.now()): Promise<{ subject: string; text: string } | null> {
  const today = pktDay(now);
  const yesterday = pktDay(dayStart(today) - 1);
  const [yFrom, tFrom] = [dayStart(yesterday), dayStart(today)];
  const tTo = tFrom + 86_400_000;
  const aheadTo = tFrom + AHEAD_DAYS * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString();

  const [yRes, upRes, waitingRes, recentRes] = await Promise.all([
    db.from("scheduled_posts").select(select).gte("scheduled_at", iso(yFrom)).lt("scheduled_at", iso(tFrom)),
    db.from("scheduled_posts").select(select).eq("status", "scheduled").gte("scheduled_at", iso(now - 3 * 86_400_000)).lt("scheduled_at", iso(aheadTo)),
    db.from("scheduled_posts").select(select).in("status", ["pending_caption", "needs_changes"]).neq("post_type", "story"),
    // Facebook re-sends of the last 3 days (the post itself may be older than yesterday).
    db.from("scheduled_posts").select(select).in("post_type", ["post", "reel"]).gte("scheduled_at", iso(yFrom - 3 * 86_400_000)).lt("scheduled_at", iso(tFrom)),
  ]);
  const yRows = (yRes.data ?? []) as unknown as Row[];
  const upcoming = (upRes.data ?? []) as unknown as Row[];
  const waiting = (waitingRes.data ?? []) as unknown as Row[];
  const recent = (recentRes.data ?? []) as unknown as Row[];
  if (!yRows.length && !upcoming.length && !waiting.length) return null;

  const lines: string[] = [];
  const section = (title: string, body: string[], empty?: string) => {
    if (!body.length && !empty) return;
    lines.push("", title, ...(body.length ? body : [`• ${empty}`]));
  };

  // ── Kal ──
  const live = new Map<string, { posts: number; stories: number; platforms: Record<string, number> }>();
  for (const r of yRows.filter((r) => r.status === "posted")) {
    const s = live.get(nameOf(r)) ?? { posts: 0, stories: 0, platforms: {} };
    if (r.post_type === "story") s.stories++;
    else {
      s.posts++;
      for (const p of new Set(results(r).filter((p) => p.ok).map((p) => p.platform))) s.platforms[p] = (s.platforms[p] ?? 0) + 1;
    }
    live.set(nameOf(r), s);
  }
  const liveLines = [...live.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, s]) => {
      const per = Object.entries(s.platforms).map(([p, n]) => `${PLATFORM[p] ?? p} ${n}`).join(" · ");
      const parts = [s.posts ? `${s.posts} post${s.posts === 1 ? "" : "s"}${per ? ` (${per})` : ""}` : "", s.stories ? `${s.stories} stor${s.stories === 1 ? "y" : "ies"}` : ""].filter(Boolean);
      return `• ${name}: ${parts.join(", ")}`;
    });
  const postsLive = [...live.values()].reduce((n, s) => n + s.posts, 0);
  section(`KAL (${dayLabel(yesterday)}): KYA LIVE HUA`, liveLines, "Kal koi post live nahi hui");

  const failed = yRows.filter((r) => r.status === "failed");
  const failedStories = failed.filter((r) => r.post_type === "story");
  const failedLines = failed
    .filter((r) => r.post_type !== "story")
    .map((r) => `• ${nameOf(r)} · ${r.original_filename} (${time(r.scheduled_at!)}): ${firstError(r)}`);
  if (failedStories.length) {
    const by = new Map<string, number>();
    for (const r of failedStories) by.set(nameOf(r), (by.get(nameOf(r)) ?? 0) + 1);
    for (const [name, n] of by) failedLines.push(`• ${name}: ${n} stor${n === 1 ? "y" : "ies"} fail (${firstError(failedStories.find((r) => nameOf(r) === name)!)})`);
  }
  section("MASLE (KAL)", failedLines, "Koi masla nahi ✓");

  const resentLines = recent.flatMap((r) =>
    results(r)
      .filter((p) => p.resent && Date.parse(p.resent.at) >= yFrom && Date.parse(p.resent.at) < tFrom)
      .map(() => `• ${nameOf(r)} · ${r.original_filename}: Facebook par nahi thi, dobara lagai`)
  );
  section("FACEBOOK CHECK NE KHUD THEEK KIYE", resentLines);

  // ── Ruki hui ──
  const held = upcoming.filter((r) => r.result?.held && Date.parse(r.scheduled_at!) <= now);
  const heldBy = new Map<string, Row[]>();
  for (const r of held) heldBy.set(nameOf(r), [...(heldBy.get(nameOf(r)) ?? []), r]);
  section(
    "RUKI HUI POSTS (LOGIN / CONNECTION)",
    [...heldBy.entries()].map(([name, rows]) => `• ${name}: ${rows.length} post${rows.length === 1 ? "" : "s"}: ${firstError(rows[0])}`)
  );

  // ── Aaj ──
  const todayRows = upcoming.filter((r) => Date.parse(r.scheduled_at!) >= now && Date.parse(r.scheduled_at!) < tTo);
  const todayBy = new Map<string, Row[]>();
  for (const r of todayRows) todayBy.set(nameOf(r), [...(todayBy.get(nameOf(r)) ?? []), r]);
  section(
    `AAJ (${dayLabel(today)}): KYA JAYE GA`,
    [...todayBy.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, rows]) => {
        const feed = rows.filter((r) => FEED.includes(r.post_type)).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
        const stories = rows.length - feed.length;
        const parts = [feed.length ? `${feed.length} post${feed.length === 1 ? "" : "s"} (${feed.map((r) => time(r.scheduled_at!)).join(", ")})` : "", stories ? `${stories} stor${stories === 1 ? "y" : "ies"}` : ""].filter(Boolean);
        return `• ${name}: ${parts.join(", ")}`;
      }),
    "Aaj ke liye kuch scheduled nahi"
  );

  // ── Khaali din (only where posts are waiting to be scheduled) ──
  const pending = waiting.filter((r) => r.status === "pending_caption");
  const pendingBy = new Map<string, Row[]>();
  for (const r of pending) pendingBy.set(r.project_id, [...(pendingBy.get(r.project_id) ?? []), r]);
  const emptyLines: string[] = [];
  for (const [projectId, rows] of pendingBy) {
    const days = new Set(upcoming.filter((r) => r.project_id === projectId && FEED.includes(r.post_type)).map((r) => pktDay(Date.parse(r.scheduled_at!))));
    const empty = Array.from({ length: AHEAD_DAYS }, (_, i) => pktDay(tFrom + i * 86_400_000)).filter((d) => !days.has(d));
    if (empty.length) emptyLines.push(`• ${nameOf(rows[0])}: ${empty.map(dayLabel).join(", ")}: ${rows.length} post${rows.length === 1 ? "" : "s"} caption ke baghair padi hain`);
  }
  section(`KHAALI DIN (AGLE ${AHEAD_DAYS} DIN, JAB KE POSTS MAUJOOD HAIN)`, emptyLines);

  // ── Waiting ──
  const waitLines = (status: string) => {
    const by = new Map<string, Row[]>();
    for (const r of waiting.filter((r) => r.status === status)) by.set(nameOf(r), [...(by.get(nameOf(r)) ?? []), r]);
    return [...by.entries()].map(([name, rows]) => {
      const oldestDays = Math.floor((now - Math.min(...rows.map((r) => Date.parse(r.created_at)))) / 86_400_000);
      return `• ${name}: ${rows.length} post${rows.length === 1 ? "" : "s"}${oldestDays >= 1 ? ` (sab se purani ${oldestDays} din)` : ""}`;
    });
  };
  section("CAPTION KE BAGHAIR (HAMARI TARAF SE)", waitLines("pending_caption"));
  section("CLIENT KI CHANGES KA INTEZAR", waitLines("needs_changes"));

  const problems = failed.length + held.length;
  const subject = `Subah ki report · ${dayLabel(today)}: kal ${postsLive} post${postsLive === 1 ? "" : "s"} live${problems ? `, ${problems} ${problems === 1 ? "masla" : "masle"}` : ", sab theek"}`;
  const text = [`Planner ki subah ki report: ${dayLabel(today)}`, ...lines, "", `Planner: ${siteUrl}/dashboard/social`].join("\n");
  return { subject, text };
}

/** Sends today's report once, from 8 AM PKT. Returns true when it was sent this run. */
export async function sendMorningReport(now = Date.now()): Promise<boolean> {
  if (!isResendConfigured) return false;
  if (new Date(now + PKT_MS).getUTCHours() < SEND_FROM_HOUR) return false;
  const key = `morning-report:${pktDay(now)}`;
  const { data: firstToday, error } = await db.rpc("check_rate_limit", { p_key: key, p_limit: 1, p_window_seconds: 2 * 86_400 });
  if (error || firstToday !== true) return false;
  try {
    const report = await buildMorningReport(now);
    if (!report) return false;
    const { error: sendError } = await resend.emails.send({ from: fromEmail, to: toEmail, subject: report.subject, text: report.text });
    if (sendError) throw new Error(sendError.message);
    return true;
  } catch (error) {
    await db.from("rate_limits").delete().eq("key", key); // let the next run try again
    throw error;
  }
}
