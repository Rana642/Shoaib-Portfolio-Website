"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DayNote } from "@/lib/planner-day-notes";
import { ChevronLeft, ChevronRight, Plus, Trash2, LoaderCircle, UploadCloud, Heart, MessageCircle, Share2, Check, MapPin, Clapperboard, CircleDashed, AlertTriangle, Film, ThumbsUp, LayoutGrid, Download, Send, X, ShieldCheck, ImageUp } from "lucide-react";
import { clearPostChanges, createPlannerPost, deletePost, importDriveFileForBulk, listDriveFolderForBulk, movePost, verifyDriveImportForBulk, fetchPlannerMediaFromLink, discardPlannerMedia, replacePostFile, postDownloadUrl, publishPostNow, reorderDay, setPostTime, updatePostCaption } from "@/lib/dashboard/actions/social";
import type { DriveImportFile } from "@/lib/planner-drive";
import { lengthFits, planBulkDates, takes } from "@/lib/planner-rules";
import type { Finding } from "@/lib/post-preflight-checks";
import type { PlatformPostResult } from "@/lib/social-post";
import { ReplaceImageButton } from "@/components/portal/NeedsChangesAlert";
import { deletePortalUpload } from "@/lib/portal/planner";
import PlannerUploader from "@/components/portal/PlannerUploader";
import PlannerAudit from "@/components/dashboard/social/PlannerAudit";
import { portalDeletePost, portalDownloadUrl, portalPublishNow, portalReplacePostFile, portalSetPostTime, portalUpdateCaption } from "@/lib/portal/post-actions";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TikTokIcon, YoutubeIcon } from "@/components/ui/SocialIcons";
import type { PostType, ProjectOption, ScheduledPost } from "@/lib/dashboard/types";

type PostWithUrl = ScheduledPost & { imageUrl: string | null; coverUrl?: string | null };

/** Which platforms take each kind: lib/planner-rules.ts (shared with the MCP tools). */
type Kind = PostType;
const kindOf = (post: ScheduledPost): Kind => post.post_type ?? "post";

/** The Posts Planner's tabs across the top; Posts / Stories is the toggle on
 *  the side (Shoaib, 2026-10-16). Photo posts are "Image" here so the word
 *  "Posts" only means the side toggle. */
type FeedTab = "all" | "post" | "reel" | "video";
const FEED_TABS: { key: FeedTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "post", label: "Image" },
  { key: "reel", label: "Reels & Shorts" },
  { key: "video", label: "Videos" },
];
const KIND_NAME: Record<Kind, string> = { post: "post", reel: "Reel / Short", video: "video", story: "story" };

/** A post's picture on the calendar: the photo, or for a Reel its cover
 *  (else the video's first frame) with a small Reel badge. */
function PostMedia({ post, className, ring, badge = true }: { post: PostWithUrl; className: string; ring: string; badge?: boolean }) {
  const isVideo = post.post_type === "reel" || post.post_type === "video" || isVideoKey(post.media_key);
  const still = isVideo ? post.coverUrl : post.imageUrl;
  const Kind = KIND_BADGE[post.post_type ?? "post"];
  return (
    <div className="relative">
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={still} alt="" className={cn(className, "object-cover ring-2", ring)} />
      ) : isVideo && post.imageUrl ? (
        <video src={post.imageUrl} muted playsInline preload="metadata" className={cn(className, "object-cover ring-2 bg-ink", ring)} />
      ) : (
        <div className={cn(className, "bg-ink/10 ring-2", ring)} />
      )}
      {Kind && badge && (
        <span className="absolute top-1 left-1 flex items-center gap-1 rounded-full bg-ink/80 text-cloud px-1.5 py-0.5 text-tag">
          <Kind.Icon className="size-3" aria-hidden />
          {Kind.label}
        </span>
      )}
    </div>
  );
}

/** An uploaded video (Reel, or a video story) — told by its file extension. */
const isVideoKey = (key: string) => /\.(mp4|mov)$/i.test(key);

const KIND_BADGE: Record<string, { label: string; Icon: typeof Clapperboard } | null> = {
  post: null,
  reel: { label: "Reel", Icon: Clapperboard },
  video: { label: "Video", Icon: Film },
  story: { label: "Story", Icon: CircleDashed },
};
type ViewMode = "week" | "month";

const STATUS_RING: Record<string, string> = {
  pending_caption: "ring-citrus",
  needs_changes: "ring-orange-500",
  scheduled: "ring-cobalt",
  posted: "ring-green-600",
  failed: "ring-red-600",
};

const STATUS_LABEL: Record<string, { text: string; classes: string }> = {
  pending_caption: { text: "Needs caption", classes: "bg-citrus/15 text-ink" },
  needs_changes: { text: "Needs changes", classes: "bg-orange-500/15 text-orange-800" },
  scheduled: { text: "Scheduled", classes: "bg-cobalt/10 text-ink" },
  posted: { text: "Posted", classes: "bg-green-600/10 text-green-700" },
  failed: { text: "Failed", classes: "bg-red-600/10 text-red-700" },
};

// What a client sees in the portal: failed posts never reach them (the page
// filters those out), and "needs caption" is my job, not theirs.
const CLIENT_STATUS_LABEL: Record<string, { text: string; classes: string }> = {
  pending_caption: { text: "Being prepared", classes: "bg-citrus/15 text-ink" },
  needs_changes: { text: "Needs changes", classes: "bg-orange-500/15 text-orange-800" },
  scheduled: { text: "Scheduled", classes: "bg-cobalt/10 text-ink" },
  posted: { text: "Posted", classes: "bg-green-600/10 text-green-700" },
};

/** A client may take back only their own upload that's still waiting for a
 *  caption, or that needs changes. */
const clientCanRemove = (post: ScheduledPost) =>
  Boolean(post.uploaded_by_email) && (post.status === "pending_caption" || post.status === "needs_changes");

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DRAG_MIME = "application/x-scheduled-post-id";

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

// Posts are scheduled in Pakistan time (see DEFAULT_POST_HOUR_UTC in
// scheduled-posts.ts — 05:00 UTC really is 10:00 AM PKT) but this was
// displaying the raw UTC hour instead, so a 10 AM post showed as "5:00 AM"
// on the calendar. Asia/Karachi has no DST, so this is always exactly +5.
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });
}

// The time picker is only for posts, Stories, Reels and Videos created from
// 4 Nov 2026 on (Shoaib): everything scheduled before keeps its time and drag
// behaviour exactly as it was.
const TIME_EDIT_FROM = "2026-11-04T00:00:00Z";

/** A UTC timestamp as the Pakistan date ("YYYY-MM-DD") and time ("HH:MM") for the inputs. */
function pktParts(iso: string): { date: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + 5 * 3600 * 1000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** The time on a week card: plain text for older posts, and for newer ones that
 *  haven't gone out a button that opens a small date + time form (Pakistan time). */
function PostTimeEditor({ post, client, clientEdit = false }: { post: ScheduledPost; client: boolean; clientEdit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const parts = post.scheduled_at ? pktParts(post.scheduled_at) : { date: "", time: "" };
  const [date, setDate] = useState(parts.date);
  const [time, setTime] = useState(parts.time);
  if (!post.scheduled_at) return null;

  const editable =
    (!client || clientEdit) && post.created_at >= TIME_EDIT_FROM && post.status !== "posted" && post.status !== "failed";
  if (!editable) return <p className="text-tag text-ink-subtle">{timeLabel(post.scheduled_at)}</p>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDate(parts.date);
          setTime(parts.time);
          setError(null);
          setOpen(true);
        }}
        title="Set the date and time"
        className="text-tag text-ink-subtle hover:text-ink underline decoration-dotted cursor-pointer"
      >
        {timeLabel(post.scheduled_at)}
      </button>
    );
  }

  const save = () =>
    startTransition(async () => {
      const res = await (client ? portalSetPostTime : setPostTime)(post.id, date, time);
      if (res && "error" in res && res.error) setError(res.error);
      else setOpen(false);
    });

  return (
    <div className="space-y-1 w-full" draggable onDragStart={(e) => e.preventDefault()}>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClasses, "!py-1 !px-1.5 text-tag")} />
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(inputClasses, "!py-1 !px-1.5 text-tag")} />
      <p className="text-tag text-ink-subtle">Pakistan time</p>
      {error && <p className="text-tag text-red-700">{error}</p>}
      <div className="flex gap-1">
        <button
          type="button"
          disabled={pending || !date || !time}
          onClick={save}
          className="flex-1 rounded-md bg-ink text-cloud px-2 py-1 text-tag font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md border border-ink/15 px-2 py-1 text-tag">
          Cancel
        </button>
      </div>
    </div>
  );
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "YYYY-MM-DD" + n days, in UTC so it can't drift across a DST-less
 *  server clock. */
function startOfWeek(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay()));
}

export default function PlannerCalendar({
  projects,
  selectedProjectId,
  posts,
  connectedPlatforms,
  mode = "admin",
  canUpload = true,
  clientCan,
  plannerPath = "/dashboard/social/planner",
  dayNotes = {},
  weatherCity = null,
  section = "feed",
  switchPaths,
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  posts: PostWithUrl[];
  /** Platforms this project has an active connected account for — drives
   *  the upload modal's "post to" checkboxes. */
  connectedPlatforms: string[];
  /** "client" = the client portal: view + (optionally) upload graphics.
   *  No moving, bulk upload, captions or deleting anything but their own
   *  still-pending uploads — all of that stays mine. */
  mode?: "admin" | "client";
  /** Client mode: whether they may add graphics (the "uploads" feature). */
  canUpload?: boolean;
  /** Client mode: "Edit posts" (caption, day/time, delete) and "Publish now", each a portal switch. */
  clientCan?: { edit: boolean; publish: boolean };
  /** Where switching project navigates. */
  plannerPath?: string;
  /** Pakistan holidays + the project's city weather, by YYYY-MM-DD. */
  dayNotes?: Record<string, DayNote>;
  /** The city the weather is for (null = no city set on the project). */
  weatherCity?: string | null;
  /** "feed" = the main Planner (Posts, Reels & Shorts, Videos — tabs);
   *  "stories" = the separate Stories Planner. */
  section?: "feed" | "stories";
  /** The Posts / Stories toggle on the side: each side's page, or null when
   *  this person can't open it (no toggle unless both exist). */
  switchPaths?: { feed: string | null; stories: string | null };
}) {
  const isClient = mode === "client";
  // A client with "Edit posts" or "Publish now" opens the same post window as the dashboard.
  const clientOpens = isClient && Boolean(clientCan?.edit || clientCan?.publish);
  const isStories = section === "stories";
  // Client uploads (PlannerUploader) are photo posts, so the Stories Planner is view-only for them.
  const canAdd = !isClient ? true : canUpload && !isStories;
  const [tab, setTab] = useState<FeedTab>("all");
  const visiblePosts = useMemo(
    () => posts.filter((p) => (isStories ? kindOf(p) === "story" : kindOf(p) !== "story" && (tab === "all" || kindOf(p) === tab))),
    [posts, isStories, tab]
  );
  // "Needs caption" count per tab, so waiting work shows from any tab.
  const waitingByTab = useMemo(() => {
    const counts: Record<FeedTab, number> = { all: 0, post: 0, reel: 0, video: 0 };
    for (const p of posts) {
      const k = kindOf(p);
      if (k === "story" || p.status !== "pending_caption") continue;
      counts.all++;
      counts[k]++;
    }
    return counts;
  }, [posts]);
  const modalKinds: Kind[] = isStories ? ["story"] : tab === "all" ? ["post", "reel", "video"] : [tab];
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  // The post open in the details window, by id so a refresh shows its new state.
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsPost = detailsId ? (posts.find((p) => p.id === detailsId) ?? null) : null;
  const [uploadDate, setUploadDate] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [, startMoveTransition] = useTransition();

  const postsByDate = useMemo(() => {
    const map = new Map<string, PostWithUrl[]>();
    for (const p of visiblePosts) {
      if (!p.scheduled_at) continue;
      const key = dateKey(p.scheduled_at);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    for (const rows of map.values()) rows.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return map;
  }, [visiblePosts]);

  // Duplicates are found by content on the server (lib/media-fingerprint.ts),
  // never by file name: monthly folders reuse 1.png, Friday-1.png… for new posts.

  const todayKey = new Date().toISOString().slice(0, 10);
  const goToToday = () => {
    setWeekStart(startOfWeek(new Date()));
    const now = new Date();
    setMonthCursor(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  };

  const onDropOnDay = (targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    const postId = e.dataTransfer.getData(DRAG_MIME);
    if (!postId) return;
    startMoveTransition(() => {
      movePost(postId, targetKey);
    });
  };

  const dayDropProps = (key: string) => isClient ? {} : ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverKey(key);
    },
    onDragLeave: () => setDragOverKey((cur) => (cur === key ? null : cur)),
    onDrop: (e: React.DragEvent) => onDropOnDay(key, e),
  });

  // Dropping onto a card (week view) puts the dragged post just above or
  // below it — reordering within a day, or moving in from another day at
  // that spot. The order becomes the posts' times (10:00, 10:05, …).
  const [dropTarget, setDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const cardDropProps = (dayKey: string, dayPosts: PostWithUrl[], target: PostWithUrl) =>
    isClient
      ? {}
      : {
          onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const box = e.currentTarget.getBoundingClientRect();
            const after = e.clientY > box.top + box.height / 2;
            setDropTarget((cur) => (cur?.id === target.id && cur.after === after ? cur : { id: target.id, after }));
          },
          onDragLeave: () => setDropTarget((cur) => (cur?.id === target.id ? null : cur)),
          onDrop: (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation(); // the day column would otherwise also handle it
            setDragOverKey(null);
            const after = dropTarget?.id === target.id ? dropTarget.after : false;
            setDropTarget(null);
            const postId = e.dataTransfer.getData(DRAG_MIME);
            if (!postId || postId === target.id) return;
            const order = dayPosts.map((p) => p.id).filter((id) => id !== postId);
            order.splice(order.indexOf(target.id) + (after ? 1 : 0), 0, postId);
            startMoveTransition(() => {
              reorderDay(dayKey, order);
            });
          },
        };

  // Month grid cells (padded to full weeks).
  const year = monthCursor.getUTCFullYear();
  const month = monthCursor.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthCells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month + 1)}-${pad(i + 1)}`),
  ];
  while (monthCells.length % 7 !== 0) monthCells.push(null);

  // Week columns.
  const weekKeys = Array.from({ length: 7 }, (_, i) => toKey(new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + i
  ))));

  // The week view slides a day at a time, so its 7 days often span two months.
  const weekLabel = (() => {
    const first = new Date(weekKeys[0]);
    const last = new Date(weekKeys[6]);
    if (first.getUTCMonth() === last.getUTCMonth()) return monthLabel(first);
    const short = (d: Date, withYear: boolean) =>
      d.toLocaleDateString(undefined, { month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
    return `${short(first, first.getUTCFullYear() !== last.getUTCFullYear())} – ${short(last, true)}`;
  })();
  const headerLabel = view === "week" ? weekLabel : monthLabel(monthCursor);
  // Week view: one day per click (Shoaib, 2026-10-02) — the 7 columns slide.
  const shiftWeek = (days: number) =>
    setWeekStart(new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + days)));

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {switchPaths?.feed && switchPaths.stories && (
        <PlannerSideToggle section={section} paths={{ feed: switchPaths.feed, stories: switchPaths.stories }} projectId={selectedProjectId} />
      )}
    <div className="flex-1 min-w-0 space-y-5">
      {!isStories && (
        <div className="flex flex-wrap items-center gap-1 border-b border-ink/10" role="tablist" aria-label="What to show">
          {FEED_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-small font-medium transition-colors cursor-pointer",
                tab === t.key ? "border-citrus text-ink" : "border-transparent text-ink-muted hover:text-ink"
              )}
            >
              {t.label}
              {!isClient && waitingByTab[t.key] > 0 && (
                <span className="rounded-full bg-citrus/25 px-1.5 text-tag tabular-nums" title="Waiting for a caption">
                  {waitingByTab[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-ink/15 p-1 w-fit">
          {(["week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 rounded-md text-small font-medium capitalize transition-colors cursor-pointer",
                view === v ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink"
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={view === "week" ? "Previous day" : "Previous month"}
            onClick={() => (view === "week" ? shiftWeek(-1) : setMonthCursor(new Date(Date.UTC(year, month - 1, 1))))}
            className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-ink/5 transition-colors"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={goToToday} className={buttonStyles.secondary}>
            Today
          </button>
          <p className="font-medium min-w-40 text-center">{headerLabel}</p>
          <button
            type="button"
            aria-label={view === "week" ? "Next day" : "Next month"}
            onClick={() => (view === "week" ? shiftWeek(1) : setMonthCursor(new Date(Date.UTC(year, month + 1, 1))))}
            className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-ink/5 transition-colors"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isClient && connectedPlatforms.length > 0 && (
            <div className="flex items-center gap-1.5" title="Connected for this project">
              <span className="text-tag uppercase tracking-widest text-ink-subtle mr-0.5">Connected:</span>
              {connectedPlatforms.map((platform) => {
                const Icon = PLATFORM_ICONS[platform];
                return (
                  <span
                    key={platform}
                    title={PLATFORM_LABELS[platform] ?? platform}
                    className="flex items-center justify-center size-7 rounded-full border border-ink/15 text-ink-muted"
                  >
                    {Icon ? <Icon className="size-3.5" aria-hidden /> : (PLATFORM_LABELS[platform] ?? platform)[0]}
                  </span>
                );
              })}
            </div>
          )}
          {(!isClient || projects.length > 1) && (
            <select
              className={`${inputClasses} max-w-72`}
              value={selectedProjectId}
              onChange={(e) => router.push(`${plannerPath}?project=${e.target.value}`)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          {!isClient && !isStories && (tab === "all" || tab === "post") && (
            <button type="button" onClick={() => setBulkOpen(true)} className={buttonStyles.secondary}>
              <UploadCloud className="size-4" aria-hidden />
              Bulk upload
            </button>
          )}
          {!isClient && (
            <button type="button" onClick={() => setAuditOpen(true)} className={buttonStyles.secondary}>
              <ShieldCheck className="size-4" aria-hidden />
              Audit
            </button>
          )}
        </div>
      </div>

      {view === "week" ? (
        <Card className="p-0 overflow-x-auto">
          <div className="grid grid-cols-7 min-w-[980px] w-full divide-x divide-ink/10">
            {weekKeys.map((key) => {
              const dayPosts = postsByDate.get(key) ?? [];
              const d = new Date(key);
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  {...dayDropProps(key)}
                  className={cn(
                    "min-h-[calc(100vh-320px)] flex flex-col transition-colors",
                    dragOverKey === key ? "bg-cobalt/5" : isToday ? "bg-citrus/5" : ""
                  )}
                >
                  <div
                    className={cn(
                      "px-3 py-2 text-center border-b sticky top-0",
                      isToday ? "border-citrus/40 text-ink font-semibold" : "border-ink/10 text-ink-subtle"
                    )}
                  >
                    <p className="font-mono uppercase text-tag tracking-widest">{WEEKDAYS[d.getUTCDay()]}</p>
                    {/* The month too, so a week across two months reads right (Shoaib, 2026-11-10). */}
                    <p className="text-body-lg">
                      {d.getUTCDate()} <span className="text-small">{d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })}</span>
                    </p>
                    <DayNoteBadges note={dayNotes[key]} />
                  </div>
                  <div className="flex-1 p-2 space-y-2">
                    {dayPosts.map((p) => (
                      <WeekPostCard
                        key={p.id}
                        post={p}
                        client={isClient}
                        onOpen={isClient && !clientOpens ? undefined : () => setDetailsId(p.id)}
                        dropProps={cardDropProps(key, dayPosts, p)}
                        dropLine={dropTarget?.id === p.id ? (dropTarget.after ? "after" : "before") : null}
                        onDragEnd={() => setDropTarget(null)}
                      />
                    ))}
                    {canAdd && (
                      <button
                        type="button"
                        onClick={() => setUploadDate(key)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/15 text-ink-subtle hover:text-ink hover:border-ink/30 transition-colors py-2 text-small"
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-3 overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[720px]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="font-mono uppercase text-tag tracking-widest text-ink-subtle px-2 py-1">
                {w}
              </div>
            ))}
            {monthCells.map((key, i) => {
              if (!key) return <div key={`blank-${i}`} className="min-h-28" />;
              const dayPosts = postsByDate.get(key) ?? [];
              const dayNum = Number(key.slice(-2));
              return (
                <div
                  key={key}
                  {...dayDropProps(key)}
                  className={cn(
                    "min-h-28 rounded-lg border p-2 flex flex-col gap-1.5 transition-colors",
                    dragOverKey === key
                      ? "border-cobalt/60 bg-cobalt/5"
                      : key === todayKey
                        ? "border-citrus/60 bg-citrus/5"
                        : "border-ink/10"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-small text-ink-subtle">{dayNum}</span>
                    {dayNotes[key]?.weather && (
                      <span className="text-[10px] text-ink-subtle tabular-nums" title={`${dayNotes[key]!.weather!.label}${weatherCity ? ` · ${weatherCity}` : ""}`}>
                        {dayNotes[key]!.weather!.emoji} {dayNotes[key]!.weather!.max}°
                      </span>
                    )}
                    {canAdd && (
                      <button
                        type="button"
                        aria-label={`Add post on ${key}`}
                        onClick={() => setUploadDate(key)}
                        className="text-ink-subtle hover:text-ink transition-colors"
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                  {dayNotes[key]?.holiday && (
                    <span
                      className="self-start rounded bg-citrus/25 px-1.5 py-0.5 text-[10px] leading-tight"
                      title={dayNotes[key]!.holiday!.moon ? "Expected date — depends on the moon sighting" : undefined}
                    >
                      {dayNotes[key]!.holiday!.name}
                      {dayNotes[key]!.holiday!.moon ? " *" : ""}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {dayPosts.map((p) => (
                      <DayPostThumb key={p.id} post={p} client={isClient} onOpen={isClient && !clientOpens ? undefined : () => setDetailsId(p.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {detailsPost && (!isClient || clientOpens) && (
        <PostDetails key={detailsPost.id} post={detailsPost} client={isClient ? clientCan : undefined} onClose={() => setDetailsId(null)} />
      )}

      {uploadDate && isClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setUploadDate(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <PlannerUploader key={uploadDate} projectId={selectedProjectId} defaultDate={uploadDate} onDone={() => setUploadDate(null)} canSchedule={Boolean(clientCan?.edit)} canPublish={Boolean(clientCan?.publish)} />
            <div className="flex justify-end mt-3">
              <button type="button" onClick={() => setUploadDate(null)} className={buttonStyles.secondary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {uploadDate && !isClient && (
        <UploadModal
          date={uploadDate}
          kinds={modalKinds}
          projectId={selectedProjectId}
          connectedPlatforms={connectedPlatforms}
          onClose={() => setUploadDate(null)}
        />
      )}
      {auditOpen && !isClient && (
        <PlannerAudit
          key={selectedProjectId}
          projectId={selectedProjectId}
          onClose={() => setAuditOpen(false)}
          onOpenPost={(id) => {
            setAuditOpen(false);
            setDetailsId(id);
          }}
        />
      )}
      {bulkOpen && (
        <BulkUploadModal
          projectId={selectedProjectId}
          connectedPlatforms={connectedPlatforms}
          occupiedDates={postsByDate}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
    </div>
  );
}

/** Posts / Stories, stacked on the left of the calendar (a row above it on a
 *  phone). Each side is its own page, so the open project carries over. */
function PlannerSideToggle({
  section,
  paths,
  projectId,
}: {
  section: "feed" | "stories";
  paths: { feed: string; stories: string };
  projectId: string;
}) {
  const options = [
    { key: "feed" as const, label: "Posts", Icon: LayoutGrid },
    { key: "stories" as const, label: "Stories", Icon: CircleDashed },
  ];
  return (
    <nav
      aria-label="Posts or Stories"
      className="flex md:flex-col gap-1 rounded-xl border border-ink/15 p-1 md:w-24 md:self-start md:sticky md:top-4 shrink-0"
    >
      {options.map(({ key, label, Icon }) => {
        const active = section === key;
        return (
          <Link
            key={key}
            href={`${paths[key]}?project=${projectId}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-1 flex md:flex-col items-center justify-center gap-1.5 rounded-lg px-3 py-2 md:py-3 text-small font-medium transition-colors",
              active ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink hover:bg-ink/5"
            )}
          >
            <Icon className="size-4 md:size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function removePost(post: ScheduledPost, client: boolean) {
  return client ? deletePortalUpload(post.id) : deletePost(post.id);
}

function WeekPostCard({
  post,
  client = false,
  dropProps,
  dropLine = null,
  onDragEnd,
  onOpen,
}: {
  post: PostWithUrl;
  client?: boolean;
  /** Opens the post's details window (admin). */
  onOpen?: () => void;
  /** Drop handlers for reordering within the day (admin week view). */
  dropProps?: React.HTMLAttributes<HTMLDivElement>;
  /** Where a dragged post would land relative to this card. */
  dropLine?: "before" | "after" | null;
  onDragEnd?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const ring = STATUS_RING[post.status] ?? "ring-ink/20";
  const label = (client ? CLIENT_STATUS_LABEL : STATUS_LABEL)[post.status];
  const removable = !client || clientCanRemove(post);

  return (
    <div
      className={cn(
        "relative group rounded-lg border border-ink/10 bg-white",
        !client && "cursor-grab active:cursor-grabbing",
        dropLine === "before" && "before:absolute before:-top-1.5 before:inset-x-0 before:h-0.5 before:rounded-full before:bg-cobalt",
        dropLine === "after" && "after:absolute after:-bottom-1.5 after:inset-x-0 after:h-0.5 after:rounded-full after:bg-cobalt"
      )}
      title={post.caption ?? post.original_filename}
      draggable={!client}
      onDragStart={client ? undefined : (e) => e.dataTransfer.setData(DRAG_MIME, post.id)}
      onDragEnd={onDragEnd}
      {...dropProps}
    >
      <div className="flex flex-wrap items-center justify-between px-2 pt-1.5 gap-1">
        <PostTimeEditor post={post} client={client} />
        {label && (
          <span className={cn("text-tag font-medium rounded-full px-1.5 py-0.5 shrink-0", label.classes)}>
            {label.text}
          </span>
        )}
      </div>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="block w-full text-left rounded focus-visible:outline-2 focus-visible:outline-ink" aria-label="Open post details">
          <div className="p-1.5 pt-1">
            <PostMedia post={post} ring={ring} className="w-full aspect-square rounded" />
          </div>
          {post.caption && <p className="text-tag text-ink-muted px-2 pb-1.5 line-clamp-2">{post.caption}</p>}
        </button>
      ) : (
        <>
          <div className="p-1.5 pt-1">
            <PostMedia post={post} ring={ring} className="w-full aspect-square rounded" />
          </div>
          {post.caption && <p className="text-tag text-ink-muted px-2 pb-1.5 line-clamp-2">{post.caption}</p>}
        </>
      )}
      {post.status === "needs_changes" && post.review_note && <NeedsChangesNote post={post} client={client} />}
      {post.uploaded_by_email && (
        <p className="text-tag px-2 pb-1.5 line-clamp-3" title={post.client_note ?? undefined}>
          <span className="inline-block rounded-full bg-citrus/25 px-1.5 py-0.5 font-medium">{client ? "Your upload" : "From client"}</span>
          {post.client_note && <span className="block text-ink-muted mt-0.5">“{post.client_note}”</span>}
        </p>
      )}
      {removable && (
        <button
          type="button"
          aria-label="Remove post"
          disabled={pending}
          onClick={() => startTransition(async () => void (await removePost(post, client)))}
          className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center size-5 rounded-full bg-ink text-cloud"
        >
          {pending ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Trash2 className="size-3" aria-hidden />}
        </button>
      )}
    </div>
  );
}

type PlatformResult = Pick<PlatformPostResult, "platform" | "label" | "ok" | "error">;

/** One post opened from the calendar: see it whole, fix the caption or time,
 *  download the file, publish it now, or delete it (Shoaib, 2026-11-09). In the
 *  client portal (`client`) the same window runs the portal's own actions, and
 *  only what that client's switches allow (2026-11-10). */
function PostDetails({ post, onClose, client }: { post: PostWithUrl; onClose: () => void; client?: { edit: boolean; publish: boolean } }) {
  const canEdit = !client || client.edit;
  const canPublish = !client || client.publish;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [justPublished, setJustPublished] = useState<PlatformResult[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const out = post.status === "posted" || post.status === "failed";
  const label = (client ? CLIENT_STATUS_LABEL : STATUS_LABEL)[post.status];
  const results = justPublished ?? (post.result as { platforms?: PlatformResult[] } | null)?.platforms ?? null;
  const captionChanged = caption.trim() !== (post.caption ?? "").trim();

  const publish = (confirmChecks: boolean) =>
    startTransition(async () => {
      setMessage(null);
      const res = await (client ? portalPublishNow : publishPostNow)(post.id, confirmChecks);
      if (res.status === "blocked") {
        setFindings(res.findings);
        setNeedsConfirm(false);
        setMessage({ ok: false, text: "Not published. Fix these first. (Pehle yeh theek karein.)" });
      } else if (res.status === "confirm") {
        setFindings(res.findings);
        setNeedsConfirm(true);
        setMessage({ ok: false, text: "Look at these before it goes out. (Bhejne se pehle dekh lein.)" });
      } else if (res.status === "error") {
        setMessage({ ok: false, text: res.message });
      } else {
        setFindings(null);
        setNeedsConfirm(false);
        setJustPublished(res.platforms);
        setMessage({ ok: res.ok, text: res.ok ? "Published." : (res.note ?? "Published, but some platforms failed.") });
        router.refresh();
      }
    });

  const saveCaption = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await (client ? portalUpdateCaption : updatePostCaption)(post.id, caption);
      if ("error" in res) return setMessage({ ok: false, text: res.error });
      setFindings(res.findings.length ? res.findings : null);
      setNeedsConfirm(false);
      setMessage({ ok: true, text: res.findings.length ? "Caption saved. Look at the notes below." : "Caption saved." });
      router.refresh();
    });

  const download = () =>
    startTransition(async () => {
      const res = await (client ? portalDownloadUrl : postDownloadUrl)(post.id);
      if ("error" in res) return setMessage({ ok: false, text: res.error });
      window.location.href = res.url;
    });

  const remove = () =>
    startTransition(async () => {
      if (client) {
        const res = await portalDeletePost(post.id);
        if ("error" in res) return setMessage({ ok: false, text: res.error });
      } else {
        await deletePost(post.id);
      }
      onClose();
      router.refresh();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Post details">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-body font-medium truncate">{KIND_NAME[kindOf(post)].replace(/^./, (c) => c.toUpperCase())}</h2>
            {label && <span className={cn("text-tag font-medium rounded-full px-2 py-0.5", label.classes)}>{label.text}</span>}
          </div>
          <button type="button" onClick={onClose} className="text-ink-subtle hover:text-ink" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <div className="space-y-3">
            <PostMedia post={post} ring={STATUS_RING[post.status] ?? "ring-ink/20"} className="w-full aspect-square rounded-lg" />
            <PostTimeEditor post={post} client={Boolean(client)} clientEdit={Boolean(client?.edit)} />
            {post.status === "needs_changes" && post.review_note && (
              <p className="text-small text-orange-800 flex gap-1.5">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
                {post.review_note}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-small font-medium">Caption</span>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} disabled={out || pending || !canEdit} rows={9} maxLength={2200} className={cn(inputClasses, "w-full")} />
            </label>
            {!out && canEdit && (
              <button type="button" onClick={saveCaption} disabled={pending || !captionChanged || !caption.trim()} className={buttonStyles.secondary}>
                Save caption
              </button>
            )}

            {findings && (
              <ul className="space-y-1.5 rounded-lg border border-ink/10 p-3">
                {findings.map((f) => (
                  <li key={f.code + f.en} className={cn("text-small flex gap-1.5", f.severity === "fix" ? "text-red-700" : "text-orange-800")}>
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      {f.en} <span className="text-ink-muted">({f.ur})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {results && results.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-ink/10 p-3">
                {results.map((r) => (
                  <li key={r.platform + r.label} className="text-small flex items-start gap-1.5">
                    {r.ok ? <Check className="size-4 shrink-0 mt-0.5 text-green-700" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-700" aria-hidden />}
                    <span>
                      {PLATFORM_LABELS[r.platform] ?? r.platform} · {r.label}
                      {!r.ok && r.error && <span className="block text-red-700">{r.error}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {message && <p className={cn("text-small", message.ok ? "text-green-700" : "text-red-700")}>{message.text}</p>}

            <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-4">
              {post.status === "scheduled" && canPublish && (
                <button type="button" onClick={() => publish(needsConfirm)} disabled={pending || captionChanged} className={buttonStyles.primary} title={captionChanged ? "Save the caption first" : undefined}>
                  {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                  {needsConfirm ? "Publish anyway" : "Publish now"}
                </button>
              )}
              {!out && canEdit && (
                <ChangeFileButton
                  post={post}
                  client={Boolean(client)}
                  disabled={pending}
                  onDone={(text, ok) => {
                    setMessage({ ok, text });
                    if (ok) router.refresh();
                  }}
                />
              )}
              {post.status !== "posted" && (
                <button type="button" onClick={download} disabled={pending} className={buttonStyles.secondary}>
                  <Download className="size-4" aria-hidden />
                  Download
                </button>
              )}
              {post.status !== "posted" &&
                canEdit &&
                !(client && post.status === "failed") &&
                (confirmDelete ? (
                  <button type="button" onClick={remove} disabled={pending} className={cn(buttonStyles.secondary, "text-red-700")}>
                    <Trash2 className="size-4" aria-hidden />
                    Yes, delete it
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} disabled={pending} className={cn(buttonStyles.secondary, "text-red-700")}>
                    <Trash2 className="size-4" aria-hidden />
                    Delete
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Post details "Change image": a new picture (or video, for a Reel/video/Story)
 *  in place of the old one. Caption, day/time and platforms stay; the server
 *  runs the upload checks (lib/planner-post-ops.ts replacePostMedia). */
function ChangeFileButton({ post, client, disabled, onDone }: { post: ScheduledPost; client: boolean; disabled: boolean; onDone: (text: string, ok: boolean) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const kind = kindOf(post);
  const accept =
    kind === "reel" || kind === "video" ? "video/mp4,video/quicktime" : kind === "story" ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp";

  const change = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await fetch(client ? "/api/portal/upload-url" : "/api/dashboard/social/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size, projectId: post.project_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't upload the file.");
      const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("The upload didn't go through. Please try again.");
      const done = await (client ? portalReplacePostFile : replacePostFile)(post.id, data.key, file.name);
      if ("error" in done) throw new Error(done.error);
      onDone(["File changed. The caption, time and platforms are the same.", ...done.notes].join(" "), true);
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Couldn't change the file.", false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          void change(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" disabled={disabled || busy} onClick={() => inputRef.current?.click()} className={buttonStyles.secondary}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
        {busy ? "Uploading…" : kind === "reel" || kind === "video" ? "Change video" : "Change image"}
      </button>
    </>
  );
}

/** What has to change on a held post — and the fix: Replace image for the
 *  uploader, or Clear for me when it can go out as it is. */
function NeedsChangesNote({ post, client }: { post: PostWithUrl; client: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="px-2 pb-1.5 space-y-1.5">
      <p className="text-tag text-orange-800 flex gap-1">
        <AlertTriangle className="size-3 shrink-0 mt-0.5" aria-hidden />
        <span>{post.review_note}</span>
      </p>
      {client ? (
        post.uploaded_by_email && <ReplaceImageButton postId={post.id} projectId={post.project_id} className="w-full px-2 py-1 text-tag" />
      ) : (
        <button
          type="button"
          disabled={pending}
          title="It can go out as it is — back to Needs caption"
          onClick={() =>
            startTransition(async () => {
              const res = await clearPostChanges(post.id);
              setError(res && "error" in res && res.error ? res.error : null);
            })
          }
          className="w-full flex items-center justify-center gap-1 rounded-md border border-ink/15 px-2 py-1 text-tag text-ink-muted hover:text-ink hover:bg-ink/5"
        >
          {pending ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
          Clear
        </button>
      )}
      {error && <p className="text-tag text-red-700">{error}</p>}
    </div>
  );
}

function DayPostThumb({ post, client = false, onOpen }: { post: PostWithUrl; client?: boolean; onOpen?: () => void }) {
  const [pending, startTransition] = useTransition();
  const ring = STATUS_RING[post.status] ?? "ring-ink/20";
  const removable = !client || clientCanRemove(post);

  return (
    <div
      className={cn("relative group", !client && "cursor-grab active:cursor-grabbing")}
      title={[
        post.caption ?? post.original_filename,
        client && CLIENT_STATUS_LABEL[post.status]?.text,
        post.status === "needs_changes" && post.review_note && `Needs changes: ${post.review_note}`,
        post.uploaded_by_email && `${client ? "Your upload" : "From client"} (${post.uploaded_by_email})${post.client_note ? `: ${post.client_note}` : ""}`,
      ]
        .filter(Boolean)
        .join("\n")}
      draggable={!client}
      onDragStart={client ? undefined : (e) => e.dataTransfer.setData(DRAG_MIME, post.id)}
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="block rounded focus-visible:outline-2 focus-visible:outline-ink" aria-label="Open post details">
          <PostMedia post={post} ring={ring} className="size-9 rounded" badge={false} />
        </button>
      ) : (
        <PostMedia post={post} ring={ring} className="size-9 rounded" badge={false} />
      )}
      {post.post_type === "reel" && (
        <Clapperboard className="absolute bottom-0.5 right-0.5 size-3 text-cloud drop-shadow" aria-label="Reel" />
      )}
      {post.post_type === "story" && (
        <CircleDashed className="absolute bottom-0.5 right-0.5 size-3 text-cloud drop-shadow" aria-label="Story" />
      )}
      {removable && (
        <button
          type="button"
          aria-label="Remove post"
          disabled={pending}
          onClick={() => startTransition(async () => void (await removePost(post, client)))}
          className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center size-4 rounded-full bg-ink text-cloud"
        >
          {pending ? <LoaderCircle className="size-2.5 animate-spin" aria-hidden /> : <Trash2 className="size-2.5" aria-hidden />}
        </button>
      )}
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_business: "Google Business",
};

const PLATFORM_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  google_business: MapPin as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>,
};

/** One post, one image, composed with an explicit "which channels" step and
 *  a live preview — modeled on Buffer/Metricool's composer (Shoaib's
 *  reference) rather than the original bare "pick a file" flow. Multi-file
 *  batches still go through Bulk upload; this is for a single, deliberate post. */
function UploadModal({
  date,
  kinds,
  projectId,
  connectedPlatforms,
  onClose,
}: {
  date: string;
  /** What this Planner can create here: the open tab's kind, or (on "All")
   *  post / Reel / video with a switcher. */
  kinds: Kind[];
  projectId: string;
  connectedPlatforms: string[];
  onClose: () => void;
}) {
  const [caption, setCaption] = useState("");
  // Optional time of day, Pakistan time ("HH:MM"). Empty = the usual slot.
  const [time, setTime] = useState("");
  // A photo post, a vertical Reel/Short, a landscape/long Video, or a Story.
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const reelPlatforms = connectedPlatforms.filter((p) => takes(kind, p));
  // YouTube's title (Videos, and Reels going up as Shorts) and a Video's privacy.
  const [videoTitle, setVideoTitle] = useState("");
  const [videoPrivacy, setVideoPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);
  // Defaults to every connected platform selected — matches the original
  // "one image goes everywhere" behavior unless something's deselected.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(connectedPlatforms.filter((p) => takes(kinds[0], p))));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Or from a link (any public link or a Google Drive file): the server fetches
  // it into storage with the same checks, so Schedule only needs its key.
  const [link, setLink] = useState("");
  const [linked, setLinked] = useState<{ key: string; name: string; mime: string } | null>(null);
  const dropLinked = () => {
    if (linked) void discardPlannerMedia(projectId, linked.key);
    setLinked(null);
  };
  const closeModal = () => {
    dropLinked();
    onClose();
  };

  const fetchLink = async () => {
    setError(null);
    setBusy(true);
    setStatus("Getting the file from the link…");
    try {
      const res = await fetchPlannerMediaFromLink(projectId, link.trim(), kind);
      if ("error" in res) throw new Error(res.error);
      dropLinked();
      setFile(null);
      setLinked({ key: res.key, name: res.name, mime: res.mime });
      setVideoSeconds(res.seconds);
      setPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return res.previewUrl;
      });
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get the file from that link.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const togglePlatform = (platform: string) => {
    if (!takes(kind, platform)) return;
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const switchKind = (next: Kind) => {
    if (next === kind) return;
    setKind(next);
    setFile(null);
    dropLinked();
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverFile(null);
    setVideoSeconds(null);
    setError(null);
    setSelectedPlatforms(new Set(connectedPlatforms.filter((p) => takes(next, p))));
  };

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    setError(null);
    const pickedVideo = picked.type === "video/mp4" || picked.type === "video/quicktime";
    if ((kind === "reel" || kind === "video") && !pickedVideo) {
      setError(`Choose an MP4 or MOV video for a ${kind === "reel" ? "Reel" : "video"}.`);
      return;
    }
    if (kind === "story" && !pickedVideo && !["image/jpeg", "image/png", "image/webp"].includes(picked.type)) {
      setError("A story is a JPG/PNG/WebP image or an MP4/MOV video.");
      return;
    }
    setVideoSeconds(null);
    if (pickedVideo) {
      // Read the length up front — Facebook takes 3–90 second Reels and
      // stories up to 60 seconds.
      const probeUrl = URL.createObjectURL(picked);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        setVideoSeconds(Number.isFinite(probe.duration) ? probe.duration : null);
        URL.revokeObjectURL(probeUrl);
      };
      probe.src = probeUrl;
    }
    dropLinked();
    setFile(picked);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
  };

  const previewPlatform = [...selectedPlatforms][0] ?? connectedPlatforms[0];
  const PreviewIcon = previewPlatform ? PLATFORM_ICONS[previewPlatform] : null;

  const onSubmit = async () => {
    if (!file && !linked) {
      setError(kind === "reel" || kind === "video" ? "Choose a video first." : kind === "story" ? "Choose an image or a video first." : "Choose an image first.");
      return;
    }
    if (kind !== "post" && reelPlatforms.length === 0) {
      setError(
        kind === "reel"
          ? "Reels go to Facebook, Instagram, YouTube and TikTok — connect one of them for this project first."
          : kind === "video"
            ? "Videos go to YouTube, Facebook and TikTok — connect one of them for this project first."
            : "Stories go to Facebook and Instagram — connect one of them for this project first."
      );
      return;
    }
    if (connectedPlatforms.length > 0 && selectedPlatforms.size === 0) {
      setError("Select at least one platform to post to.");
      return;
    }
    if (kind === "story" && videoSeconds != null && (videoSeconds < 3 || videoSeconds > 60)) {
      setError(`Video stories must be 3–60 seconds; this video is ${Math.round(videoSeconds)}s.`);
      return;
    }
    if (kind === "reel" && videoSeconds != null) {
      const secs = Math.round(videoSeconds);
      if (selectedPlatforms.has("facebook") && (videoSeconds < 3 || videoSeconds > 90)) {
        setError(`Facebook Reels must be 3–90 seconds; this video is ${secs}s. Untick Facebook or trim the video.`);
        return;
      }
      if (selectedPlatforms.has("instagram") && (videoSeconds < 3 || videoSeconds > 900)) {
        setError(`Instagram Reels must be 3 seconds to 15 minutes; this video is ${secs}s.`);
        return;
      }
      if (selectedPlatforms.has("youtube") && videoSeconds > 180) {
        setError(`YouTube Shorts can be up to 3 minutes; this video is ${secs}s. Untick YouTube or post it from the Videos tab.`);
        return;
      }
      if (selectedPlatforms.has("tiktok") && videoSeconds > 600) {
        setError(`TikTok takes videos up to 10 minutes; this video is ${secs}s.`);
        return;
      }
    }
    if (kind === "video" && videoSeconds != null) {
      const secs = Math.round(videoSeconds);
      if (selectedPlatforms.has("youtube") && videoSeconds > 900) {
        setError(`YouTube takes videos over 15 minutes only from verified channels; this video is ${secs}s. Verify the channel at youtube.com/verify or trim it.`);
        return;
      }
      if (selectedPlatforms.has("tiktok") && videoSeconds > 600) {
        setError(`TikTok takes videos up to 10 minutes; this video is ${secs}s. Untick TikTok or trim it.`);
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      const upload = async (f: File) => {
        setStatus(`Uploading ${f.name}…`);
        const urlRes = await fetch("/api/dashboard/social/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.name, type: f.type, size: f.size, projectId }),
        });
        const urlBody = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlBody.error || "Couldn't get an upload URL.");
        const putRes = await fetch(urlBody.url, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
        if (!putRes.ok) throw new Error(`Upload failed for ${f.name}.`);
        return urlBody.key as string;
      };
      // A file fetched from a link is already in storage.
      const mediaKey = linked ? linked.key : await upload(file!);
      const coverKey = (kind === "reel" || kind === "video") && coverFile ? await upload(coverFile) : null;

      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("media_key", mediaKey);
      fd.set("original_filename", linked ? linked.name : file!.name);
      fd.set("date", date);
      if (time) fd.set("time", time);
      // Stories show no caption, so none is sent.
      if (kind !== "story" && caption.trim()) fd.set("caption", caption.trim());
      if (kind !== "post") {
        fd.set("post_type", kind);
        if (coverKey) fd.set("cover_key", coverKey);
        if (kind !== "story" && selectedPlatforms.has("youtube") && videoTitle.trim()) fd.set("video_title", videoTitle.trim());
        if (kind === "video" && selectedPlatforms.has("youtube")) fd.set("video_privacy", videoPrivacy);
        // A Reel, Video or Story always names its platforms.
        fd.set("platforms", JSON.stringify([...selectedPlatforms].filter((p) => takes(kind, p))));
      }
      // Only send `platforms` when it's a strict subset of every connected
      // platform — otherwise omit it so the post keeps meaning "everywhere
      // this project is connected" even if a new platform gets connected later.
      const isSubset = selectedPlatforms.size > 0 && selectedPlatforms.size < connectedPlatforms.filter((p) => takes("post", p)).length;
      if (kind === "post" && isSubset) fd.set("platforms", JSON.stringify([...selectedPlatforms]));
      const result = await createPlannerPost(fd);
      if (result?.error) {
        // A refused duplicate's copy was already removed on the server.
        if ("duplicate" in result && result.duplicate) setLinked(null);
        throw new Error(result.error);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={closeModal}>
      <div
        className="w-full max-w-3xl bg-white border border-ink/10 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-ink/10">
          <div className="flex items-center gap-4">
            <p className="font-medium">
              Create {KIND_NAME[kind]} — {date}
            </p>
            {kinds.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-ink/15 p-1" role="tablist" aria-label="What to create">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => switchKind(k)}
                  disabled={busy}
                  className={cn(
                    "px-3 py-1 rounded-md text-small font-medium capitalize transition-colors cursor-pointer",
                    kind === k ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {k === "reel" ? "Reel / Short" : k}
                </button>
              ))}
            </div>
            )}
          </div>
          <button type="button" onClick={closeModal} className="text-ink-subtle hover:text-ink text-small">
            Close
          </button>
        </div>

        {connectedPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-4">
            {connectedPlatforms.map((platform) => {
              const Icon = PLATFORM_ICONS[platform];
              const unavailable = !takes(kind, platform);
              const active = !unavailable && selectedPlatforms.has(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  disabled={busy || unavailable}
                  title={
                    unavailable
                      ? kind === "post"
                        ? "YouTube takes videos — use Reels & Shorts or Videos"
                        : kind === "reel"
                          ? "Reels go to Facebook, Instagram, YouTube and TikTok"
                          : kind === "video"
                            ? "Videos go to YouTube, Facebook and TikTok"
                            : "Stories go to Facebook and Instagram"
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-medium transition-colors",
                    unavailable ? "border-ink/10 text-ink-subtle opacity-50 cursor-not-allowed" : "cursor-pointer",
                    !unavailable && (active ? "bg-ink text-cloud border-ink" : "border-ink/15 text-ink-muted hover:border-ink/30")
                  )}
                >
                  {active && <Check className="size-3.5" aria-hidden />}
                  {Icon && <Icon className="size-3.5" aria-hidden />}
                  {PLATFORM_LABELS[platform] ?? platform}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: image + caption */}
          <div className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center cursor-pointer transition-colors",
                dragOver ? "border-cobalt bg-cobalt/5" : "border-ink/15 hover:border-ink/30"
              )}
            >
              <UploadCloud className="size-6 text-ink-subtle" aria-hidden />
              <p className="text-small text-ink-muted">
                {file
                  ? file.name
                  : linked
                    ? linked.name
                    : kind === "reel"
                    ? "Drag & drop or click to choose a video (MP4/MOV, 9:16)"
                    : kind === "video"
                      ? "Drag & drop or click to choose a video (MP4/MOV, landscape or long)"
                      : kind === "story"
                      ? "Drag & drop or click to choose a 9:16 image or video (up to 60s)"
                      : "Drag & drop or click to choose an image"}
              </p>
              <input
                key={kind}
                type="file"
                accept={
                  kind === "reel" || kind === "video"
                    ? "video/mp4,video/quicktime"
                    : kind === "story"
                      ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                      : "image/jpeg,image/png,image/webp"
                }
                hidden
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {/* Or a link: any public picture/video link, or a Google Drive file (shared "Anyone with the link"). */}
            <div className="flex gap-2">
              <input
                type="url"
                className={cn(inputClasses, "flex-1 min-w-0")}
                placeholder="Or paste a link (image, video or Google Drive file)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && link.trim() && !busy) {
                    e.preventDefault();
                    void fetchLink();
                  }
                }}
                disabled={busy}
              />
              <button type="button" onClick={fetchLink} disabled={busy || !link.trim()} className={buttonStyles.secondary}>
                Fetch
              </button>
            </div>

            {kind === "story" && (
              <p className="text-tag text-ink-subtle">
                Stories show no caption and last 24 hours. Links, polls and music stickers can&apos;t be added through the API.
                {videoSeconds != null && ` Length ${Math.round(videoSeconds)}s (3–60s allowed).`}
              </p>
            )}
            {kind === "video" && videoSeconds != null && (
              <p className="text-tag text-ink-subtle">
                Length {Math.round(videoSeconds)}s · YouTube up to 15 min (longer once the channel is verified), TikTok up to 10 min.
              </p>
            )}
            {(kind === "reel" || kind === "video") && (
              <>
                {kind === "reel" && videoSeconds != null && (
                  <p className="text-tag text-ink-subtle">
                    Length {Math.round(videoSeconds)}s · Facebook 3–90s, Instagram up to 15 min, YouTube Shorts up to 3 min, TikTok up to 10 min.
                  </p>
                )}
                <label className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-3 py-2 text-small cursor-pointer">
                  <span className="text-ink-muted truncate">
                    {coverFile
                      ? `${kind === "video" ? "Thumbnail" : "Cover"}: ${coverFile.name}`
                      : kind === "video"
                        ? "Thumbnail (optional, 16:9 JPG/PNG — YouTube)"
                        : "Cover image (optional — otherwise the first frame)"}
                  </span>
                  <span className={buttonStyles.secondary}>{coverFile ? "Change" : "Choose"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={busy}
                    onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {selectedPlatforms.has("youtube") && (
                  <div className="space-y-2 rounded-lg border border-ink/10 p-3">
                    <p className="text-tag uppercase tracking-widest text-ink-subtle">YouTube</p>
                    <input
                      className={inputClasses}
                      placeholder={kind === "reel" ? "Short title (optional — else the caption's first line)" : "Video title (else the description's first line)"}
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      maxLength={100}
                      disabled={busy}
                    />
                    {kind === "video" && (
                      <select
                        className={inputClasses}
                        value={videoPrivacy}
                        onChange={(e) => setVideoPrivacy(e.target.value as "public" | "unlisted" | "private")}
                        disabled={busy}
                        aria-label="YouTube privacy"
                      >
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                      </select>
                    )}
                    <p className="text-tag text-ink-subtle">Until Google approves the YouTube API audit, uploads stay private.</p>
                  </div>
                )}
                {selectedPlatforms.has("tiktok") && (
                  <p className="text-tag text-ink-subtle">TikTok gets it as a draft in the account&apos;s inbox — add the caption and post it from the TikTok app.</p>
                )}
              </>
            )}

            <label className="flex flex-wrap items-center gap-2 text-small">
              <span className="font-medium">Time</span>
              <input
                type="time"
                className={cn(inputClasses, "!w-32")}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={busy}
              />
              <span className="text-tag text-ink-subtle">Pakistan time. Leave empty for the usual slot.</span>
            </label>

            {kind !== "story" && (
              <div>
                <textarea
                  className={inputClasses}
                  rows={5}
                  placeholder={kind === "video" ? "Write the description…" : kind === "reel" ? "Write a short caption…" : "Write a caption…"}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  disabled={busy}
                  maxLength={2200}
                />
                <p className="text-tag text-ink-subtle mt-1 text-right">{caption.length} / 2200</p>
              </div>
            )}
          </div>

          {/* Right: live preview — TikTok/Instagram Reels-style content is a
              full-bleed vertical video frame; a Facebook/Instagram/LinkedIn
              FEED post looks nothing like that (square image, caption below,
              not overlaid), so the mockup shape follows whichever platform
              is actually selected instead of one universal look. */}
          <div className="flex flex-col items-center">
            <p className="text-tag uppercase tracking-widest text-ink-subtle mb-2 self-start">Preview</p>
            {kind === "video" ? (
              <div className="w-full max-w-[300px] rounded-lg border border-ink/10 overflow-hidden bg-white">
                <div className="relative w-full aspect-video bg-ink">
                  {previewUrl ? (
                    <video src={previewUrl} muted playsInline controls className="absolute inset-0 size-full object-contain" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-cloud/40 text-small">No video yet</div>
                  )}
                </div>
                <div className="px-3 py-2.5 space-y-1">
                  <p className="text-small font-medium line-clamp-2">{videoTitle || caption.split("\n")[0] || "Video title"}</p>
                  <div className="flex items-center gap-3 text-tag text-ink-subtle">
                    <span>Shoaib Nabi Noor</span>
                    <ThumbsUp className="size-3.5" aria-hidden />
                  </div>
                </div>
              </div>
            ) : previewPlatform === "tiktok" || kind !== "post" ? (
              <div className="relative w-full max-w-[220px] aspect-[9/16] rounded-2xl bg-ink overflow-hidden">
                {previewUrl && (file?.type.startsWith("video/") || linked?.mime.startsWith("video/")) ? (
                  <video src={previewUrl} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
                ) : previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-cloud/40 text-small">
                    {kind === "reel" ? "No video yet" : kind === "story" ? "No story yet" : "No image yet"}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-3 pt-8">
                  <p className="text-cloud text-tag font-medium">Shoaib Nabi Noor</p>
                  {caption && <p className="text-cloud/90 text-tag mt-1 line-clamp-2">{caption}</p>}
                </div>
                <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-cloud">
                  <div className="flex flex-col items-center gap-0.5">
                    <Heart className="size-5" aria-hidden />
                    <span className="text-tag">0</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <MessageCircle className="size-5" aria-hidden />
                    <span className="text-tag">0</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Share2 className="size-5" aria-hidden />
                    <span className="text-tag">0</span>
                  </div>
                </div>
                {PreviewIcon && (
                  <div className="absolute top-2 left-2 flex items-center justify-center size-6 rounded-full bg-cloud/90 text-ink">
                    <PreviewIcon className="size-3.5" aria-hidden />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full max-w-[260px] rounded-lg border border-ink/10 overflow-hidden bg-white">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <div className="flex items-center justify-center size-8 rounded-full bg-ink/10 text-ink-subtle shrink-0">
                    {PreviewIcon ? <PreviewIcon className="size-4" aria-hidden /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-small font-medium leading-tight truncate">Shoaib Nabi Noor</p>
                    <p className="text-tag text-ink-subtle leading-tight">
                      {previewPlatform ? PLATFORM_LABELS[previewPlatform] ?? previewPlatform : "—"}
                    </p>
                  </div>
                </div>
                <div className="relative w-full aspect-square bg-ink/5">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-ink-subtle text-small">
                      No image yet
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 px-3 py-2.5 text-ink-muted">
                  <Heart className="size-5" aria-hidden />
                  <MessageCircle className="size-5" aria-hidden />
                  <Share2 className="size-5" aria-hidden />
                </div>
                {caption && (
                  <p className="px-3 pb-3 text-small line-clamp-3">
                    <span className="font-medium">Shoaib Nabi Noor</span> {caption}
                  </p>
                )}
              </div>
            )}
            <p className="text-tag text-ink-subtle mt-2 text-center">
              Approximate — the real post may look slightly different.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink/10">
          <div className="text-small text-ink-muted min-h-5">
            {status}
            {error && <span className="text-red-700">{error}</span>}
          </div>
          <button type="button" onClick={onSubmit} disabled={busy} className={buttonStyles.primary}>
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// The one-per-day date planner (Fridays for "friday" files) is planBulkDates in lib/planner-rules.ts.

/** Bulk import: pick a start date and drop in a whole batch (e.g. a
 *  client's 30-day content pack) — each file lands one per day in filename
 *  order, except any file named with "Friday" (see planBulkDates), which
 *  maps onto the next real Friday automatically. No caption field here
 *  since every image needs its own — those get written later (tell Claude
 *  in chat, or via the pending-caption MCP tools). Wrong day after
 *  auto-fill? Just drag it to the right one. */
function BulkUploadModal({
  projectId,
  connectedPlatforms,
  occupiedDates,
  onClose,
}: {
  projectId: string;
  connectedPlatforms: string[];
  /** Dates that already have at least one post — gap-filled before the
   *  batch spills into fresh dates. */
  occupiedDates: Map<string, unknown>;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Same "post to" selection as the single-post composer — applied to
  // every file in the batch, since a bulk upload has no per-image UI.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(connectedPlatforms));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // From Google Drive: the folder link (remembered per project on this browser) and what it holds.
  const driveKey = `planner-drive-folder:${projectId}`;
  const [driveLink, setDriveLink] = useState(() => {
    try {
      return window.localStorage.getItem(driveKey) ?? "";
    } catch {
      return "";
    }
  });
  const [driveFiles, setDriveFiles] = useState<DriveImportFile[] | null>(null);
  const [driveNotes, setDriveNotes] = useState<string[]>([]);

  const fetchDrive = async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const res = await listDriveFolderForBulk(projectId, driveLink);
      if ("error" in res) throw new Error(res.error);
      try {
        window.localStorage.setItem(driveKey, driveLink);
      } catch {
        /* remembering the link is only a convenience */
      }
      setDriveFiles(res.files);
      setDriveNotes([
        ...(res.duplicates.length ? [`Already on the planner (the same file, checked by content), skipped: ${res.duplicates.join("; ")}`] : []),
        ...(res.nameNotes.length ? [`Same name as an older post but a different file, so these are imported: ${res.nameNotes.join(", ")}`] : []),
        ...(res.unsupported.length ? [`Not an image or MP4/MOV video, skipped: ${res.unsupported.join(", ")}`] : []),
        ...(res.tooBig.length ? [`Too big (images 25 MB, videos 100 MB from Drive), skipped: ${res.tooBig.join(", ")}`] : []),
      ]);
    } catch (err) {
      setDriveFiles(null);
      setError(err instanceof Error ? err.message : "Couldn't read the folder.");
    } finally {
      setBusy(false);
    }
  };

  const importDrive = async () => {
    if (!driveFiles?.length) return;
    if (connectedPlatforms.length > 0 && selectedPlatforms.size === 0) {
      setError("Select at least one platform to post to.");
      return;
    }
    setError(null);
    setBusy(true);
    // Each file goes only to the chosen platforms that take it; a Reel only to those its length fits.
    const chosen = selectedPlatforms.size > 0 ? [...selectedPlatforms] : connectedPlatforms;
    const targetsFor = (file: DriveImportFile) => {
      // Nothing connected yet: the same as a PC upload, the post waits with no platforms picked.
      if (connectedPlatforms.length === 0) return { fit: [file.kind], all: true };
      const fit = chosen.filter((p) => takes(file.kind, p) && (file.kind !== "reel" || lengthFits("reel", p, file.seconds)));
      const everywhere = connectedPlatforms.filter((p) => takes(file.kind, p));
      return { fit, all: fit.length === everywhere.length && selectedPlatforms.size === connectedPlatforms.length };
    };
    const ready = driveFiles.filter((f) => targetsFor(f).fit.length > 0);
    const skipped = driveFiles.filter((f) => targetsFor(f).fit.length === 0).map((f) => `${f.name}: no chosen platform takes it${f.kind === "reel" ? " at this length" : ""}`);
    const dates = planBulkDates(ready.map((f) => f.name), startDate, new Set(occupiedDates.keys()));
    const failed: string[] = [...skipped];
    const importOne = async (file: DriveImportFile, date: string): Promise<string | null> => {
      const { fit, all } = targetsFor(file);
      try {
        const res = await importDriveFileForBulk({ projectId, fileId: file.id, date, platforms: all ? null : fit });
        return "error" in res ? res.error : null;
      } catch {
        return "took too long or the connection dropped";
      }
    };
    let folderCheck = "";
    let leftBehind = false;
    try {
      // Drive slows down after about 25 downloads in a row (seen 10 Nov on both hotels'
      // folders): those files wait and try again, longer each round (1, 2, then 4 minutes).
      let slowed: { file: DriveImportFile; date: string }[] = [];
      for (const [i, file] of ready.entries()) {
        setStatus(`Importing ${file.name} (${i + 1}/${ready.length})…`);
        const err = await importOne(file, dates[i]);
        if (err && /limiting downloads/i.test(err)) slowed.push({ file, date: dates[i] });
        else if (err) failed.push(`${file.name}: ${err}`);
      }
      for (const pause of [60, 120, 240]) {
        if (!slowed.length) break;
        for (let s = pause; s > 0; s--) {
          setStatus(`Google Drive slowed down. Trying ${slowed.length} file(s) again in ${s} s… (keep this window open)`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        const still: typeof slowed = [];
        for (const [i, { file, date }] of slowed.entries()) {
          setStatus(`Trying again: ${file.name} (${i + 1}/${slowed.length})…`);
          const err = await importOne(file, date);
          if (err && /limiting downloads/i.test(err)) still.push({ file, date });
          else if (err) failed.push(`${file.name}: ${err}`);
        }
        slowed = still;
      }
      for (const { file } of slowed) failed.push(`${file.name}: Google Drive is still limiting downloads. Press Fetch and Import again in a few minutes.`);
      // Is every file of the folder on the planner now? Checked by content, not by name.
      setStatus("Checking the folder against the planner…");
      const check = await verifyDriveImportForBulk(projectId, driveLink);
      if ("error" in check) folderCheck = ` The folder check didn't run: ${check.error}`;
      else {
        leftBehind = check.leftBehind.length > 0;
        folderCheck = leftBehind
          ? ` Not on the planner yet: ${check.leftBehind.join(", ")}. Press Fetch, then Import again.`
          : ` Checked: all ${check.total} file(s) of the folder are on the planner.`;
        if (check.cantTake.length) folderCheck += ` Can't go on the planner: ${check.cantTake.join(", ")}.`;
      }
    } finally {
      setBusy(false);
      setDriveFiles(null);
    }
    const done = driveFiles.length - failed.length;
    if (failed.length || leftBehind) {
      setError(`Imported ${done} of ${driveFiles.length}.${failed.length ? ` Not imported: ${failed.join("; ")}.` : ""}${folderCheck}`);
      setStatus(null);
    } else {
      setStatus(`Imported ${done} file(s) from Drive.${folderCheck}`);
    }
  };

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (connectedPlatforms.length > 0 && selectedPlatforms.size === 0) {
      setError("Select at least one platform to post to.");
      return;
    }
    setError(null);
    setBusy(true);
    let done = 0;
    try {
      // Sort by filename so a naturally-numbered pack (day01, day02, ...)
      // lands in the right order — selection order in a file picker isn't
      // guaranteed to match visual/alphabetical order across browsers.
      const sorted = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      // A file already on the planner (the same content, whatever its name) is
      // refused by the server and left out; the days are planned again after
      // it, so no day is left empty.
      const repeats: string[] = [];
      const fileArr = sorted;
      const used = new Set(occupiedDates.keys());
      // Only send `platforms` when it's a strict subset of every connected
      // platform — otherwise omit it so a post keeps meaning "everywhere
      // this project is connected" even if a new platform gets connected later.
      const isSubset = selectedPlatforms.size > 0 && selectedPlatforms.size < connectedPlatforms.length;
      for (const [i, file] of fileArr.entries()) {
        setStatus(`Uploading ${file.name} (${++done}/${fileArr.length})…`);
        const urlRes = await fetch("/api/dashboard/social/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size, projectId }),
        });
        const urlBody = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlBody.error || "Couldn't get an upload URL.");

        const putRes = await fetch(urlBody.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!putRes.ok) throw new Error(`Upload failed for ${file.name}.`);

        const fd = new FormData();
        fd.set("project_id", projectId);
        fd.set("media_key", urlBody.key);
        fd.set("original_filename", file.name);
        const date = planBulkDates(fileArr.slice(i).map((f) => f.name), startDate, used)[0];
        fd.set("date", date);
        if (isSubset) fd.set("platforms", JSON.stringify([...selectedPlatforms]));
        const result = await createPlannerPost(fd);
        if (result?.error) {
          if ("duplicate" in result && result.duplicate) {
            repeats.push(`${file.name}: ${result.error}`);
            continue;
          }
          throw new Error(result.error);
        }
        used.add(date);
      }

      if (repeats.length > 0) {
        setStatus(`Uploaded ${fileArr.length - repeats.length} new file(s). Already on the planner, not added again: ${repeats.join(" ")}`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 space-y-4 bg-white border border-ink/10 rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="font-medium">Bulk upload</p>
          <p className="text-small text-ink-muted mt-1">
            One post per day, starting from the date below, in filename order — days that already have a
            post are skipped (gaps get filled first), then the batch continues into fresh dates. Any file
            named with &quot;Friday&quot; (e.g. Friday-1, Friday-2) automatically maps onto the next real,
            still-empty Friday instead — everything else fills in around those. Drag any post afterward to
            move it to a different day. A file already uploaded before is skipped, not duplicated — you&apos;ll
            see which ones and their existing date.
          </p>
        </div>

        {connectedPlatforms.length > 0 && (
          <div>
            <p className="text-small font-medium mb-1.5">Post to (applies to every file in this batch):</p>
            <div className="flex flex-wrap gap-2">
              {connectedPlatforms.map((platform) => {
                const Icon = PLATFORM_ICONS[platform];
                const active = selectedPlatforms.has(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => togglePlatform(platform)}
                    disabled={busy}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-medium transition-colors cursor-pointer",
                      active ? "bg-ink text-cloud border-ink" : "border-ink/15 text-ink-muted hover:border-ink/30"
                    )}
                  >
                    {active && <Check className="size-3.5" aria-hidden />}
                    {Icon && <Icon className="size-3.5" aria-hidden />}
                    {PLATFORM_LABELS[platform] ?? platform}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-small font-medium mb-1.5 block">Start date</span>
          <input
            type="date"
            className={inputClasses}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={busy}
          />
        </label>

        <label className={`${buttonStyles.secondary} cursor-pointer w-fit`}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          Choose images
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>

        <div className="space-y-2 border-t border-ink/10 pt-4">
          <p className="text-small font-medium">Or from a Google Drive folder</p>
          <p className="text-tag text-ink-muted">Share the folder as &quot;Anyone with the link&quot;. Images become posts, MP4/MOV videos (up to 100 MB) become Reels; the same rules as above.</p>
          <div className="flex gap-2">
            <input
              type="url"
              className={cn(inputClasses, "flex-1")}
              placeholder="https://drive.google.com/drive/folders/…"
              value={driveLink}
              onChange={(e) => {
                setDriveLink(e.target.value);
                setDriveFiles(null);
              }}
              disabled={busy}
            />
            <button type="button" onClick={fetchDrive} disabled={busy || !driveLink.trim()} className={buttonStyles.secondary}>
              Fetch
            </button>
          </div>
          {driveFiles && (
            <div className="space-y-2">
              <p className="text-small">
                {driveFiles.filter((f) => f.kind === "post").length} image(s), {driveFiles.filter((f) => f.kind === "reel").length} video(s) to import
              </p>
              {driveNotes.map((note) => (
                <p key={note} className="text-tag text-ink-muted">
                  {note}
                </p>
              ))}
              {driveFiles.length > 0 && (
                <button type="button" onClick={importDrive} disabled={busy} className={buttonStyles.primary}>
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                  Import {driveFiles.length} file(s)
                </button>
              )}
            </div>
          )}
        </div>

        {status && <p className="text-small text-ink-muted">{status}</p>}
        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/** Under a week-view date: the holiday (citrus chip) and the city weather. */
function DayNoteBadges({ note }: { note?: DayNote }) {
  if (!note) return null;
  return (
    <div className="mt-1 flex flex-col items-center gap-1">
      {note.holiday && (
        <span
          className="rounded bg-citrus/25 px-1.5 py-0.5 text-[10px] leading-tight font-normal text-ink"
          title={note.holiday.moon ? "Expected date — depends on the moon sighting" : undefined}
        >
          {note.holiday.name}
          {note.holiday.moon ? " *" : ""}
        </span>
      )}
      {note.weather && (
        <span className="text-[11px] font-normal text-ink-muted tabular-nums" title={note.weather.label}>
          {note.weather.emoji} {note.weather.max}° / {note.weather.min}°{note.weather.rain >= 40 ? ` · ${note.weather.rain}% rain` : ""}
        </span>
      )}
    </div>
  );
}
