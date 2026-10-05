"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, LoaderCircle, UploadCloud, Heart, MessageCircle, Share2, Check, MapPin, Clapperboard, CircleDashed, AlertTriangle } from "lucide-react";
import { clearPostChanges, createPlannerPost, deletePost, movePost, reorderDay } from "@/lib/dashboard/actions/social";
import { ReplaceImageButton } from "@/components/portal/NeedsChangesAlert";
import { deletePortalUpload } from "@/lib/portal/planner";
import PlannerUploader from "@/components/portal/PlannerUploader";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TikTokIcon } from "@/components/ui/SocialIcons";
import type { ProjectOption, ScheduledPost } from "@/lib/dashboard/types";

type PostWithUrl = ScheduledPost & { imageUrl: string | null; coverUrl?: string | null };

/** Reels go to Facebook and Instagram (lib/social-post.ts REEL_PLATFORMS). */
const REEL_PLATFORMS = ["facebook", "instagram"];

/** A post's picture on the calendar: the photo, or for a Reel its cover
 *  (else the video's first frame) with a small Reel badge. */
function PostMedia({ post, className, ring, badge = true }: { post: PostWithUrl; className: string; ring: string; badge?: boolean }) {
  const isVideo = post.post_type === "reel" || isVideoKey(post.media_key);
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
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toKey(new Date(Date.UTC(y, m - 1, d + n)));
}

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
  plannerPath = "/dashboard/social/planner",
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
  /** Where switching project navigates. */
  plannerPath?: string;
}) {
  const isClient = mode === "client";
  const canAdd = !isClient || canUpload;
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("week");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [uploadDate, setUploadDate] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [, startMoveTransition] = useTransition();

  const postsByDate = useMemo(() => {
    const map = new Map<string, PostWithUrl[]>();
    for (const p of posts) {
      if (!p.scheduled_at) continue;
      const key = dateKey(p.scheduled_at);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    for (const rows of map.values()) rows.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return map;
  }, [posts]);

  // Filename → the date it's already scheduled on, so a bulk upload can
  // recognize "this exact file was already added before" (e.g. Shoaib
  // re-selecting the same content-pack folder by mistake) instead of
  // silently creating a duplicate post.
  const existingByFilename = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of posts) {
      if (p.original_filename && p.scheduled_at) map.set(p.original_filename, dateKey(p.scheduled_at));
    }
    return map;
  }, [posts]);

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
    <div className="space-y-5">
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
          {!isClient && (
            <button type="button" onClick={() => setBulkOpen(true)} className={buttonStyles.secondary}>
              <UploadCloud className="size-4" aria-hidden />
              Bulk upload
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
                    <p className="text-body-lg">{d.getUTCDate()}</p>
                  </div>
                  <div className="flex-1 p-2 space-y-2">
                    {dayPosts.map((p) => (
                      <WeekPostCard
                        key={p.id}
                        post={p}
                        client={isClient}
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
                  <div className="flex items-center justify-between">
                    <span className="text-small text-ink-subtle">{dayNum}</span>
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
                  <div className="flex flex-wrap gap-1">
                    {dayPosts.map((p) => (
                      <DayPostThumb key={p.id} post={p} client={isClient} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {uploadDate && isClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={() => setUploadDate(null)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <PlannerUploader key={uploadDate} projectId={selectedProjectId} defaultDate={uploadDate} onDone={() => setUploadDate(null)} />
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
          projectId={selectedProjectId}
          connectedPlatforms={connectedPlatforms}
          existingByFilename={existingByFilename}
          onClose={() => setUploadDate(null)}
        />
      )}
      {bulkOpen && (
        <BulkUploadModal
          projectId={selectedProjectId}
          connectedPlatforms={connectedPlatforms}
          occupiedDates={postsByDate}
          existingByFilename={existingByFilename}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
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
}: {
  post: PostWithUrl;
  client?: boolean;
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
      <div className="flex items-center justify-between px-2 pt-1.5 gap-1">
        {post.scheduled_at && <p className="text-tag text-ink-subtle">{timeLabel(post.scheduled_at)}</p>}
        {label && (
          <span className={cn("text-tag font-medium rounded-full px-1.5 py-0.5 shrink-0", label.classes)}>
            {label.text}
          </span>
        )}
      </div>
      <div className="p-1.5 pt-1">
        <PostMedia post={post} ring={ring} className="w-full aspect-square rounded" />
      </div>
      {post.caption && (
        <p className="text-tag text-ink-muted px-2 pb-1.5 line-clamp-2">{post.caption}</p>
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

function DayPostThumb({ post, client = false }: { post: PostWithUrl; client?: boolean }) {
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
      <PostMedia post={post} ring={ring} className="size-9 rounded" badge={false} />
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
  google_business: "Google Business",
};

const PLATFORM_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  tiktok: TikTokIcon,
  google_business: MapPin as unknown as React.ComponentType<React.SVGProps<SVGSVGElement>>,
};

/** One post, one image, composed with an explicit "which channels" step and
 *  a live preview — modeled on Buffer/Metricool's composer (Shoaib's
 *  reference) rather than the original bare "pick a file" flow. Multi-file
 *  batches still go through Bulk upload; this is for a single, deliberate post. */
function UploadModal({
  date,
  projectId,
  connectedPlatforms,
  existingByFilename,
  onClose,
}: {
  date: string;
  projectId: string;
  connectedPlatforms: string[];
  /** Filename → date it's already scheduled on — warns instead of letting
   *  the same image get queued twice. */
  existingByFilename: Map<string, string>;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState("");
  // A photo post, a video Reel, or a Story (photo or video) — Reels and
  // Stories go to Facebook + Instagram.
  const [kind, setKind] = useState<"post" | "reel" | "story">("post");
  const reelPlatforms = connectedPlatforms.filter((p) => REEL_PLATFORMS.includes(p));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null);
  // Defaults to every connected platform selected — matches the original
  // "one image goes everywhere" behavior unless something's deselected.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(connectedPlatforms));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);

  const togglePlatform = (platform: string) => {
    if (kind !== "post" && !REEL_PLATFORMS.includes(platform)) return;
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const switchKind = (next: "post" | "reel" | "story") => {
    if (next === kind) return;
    setKind(next);
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCoverFile(null);
    setVideoSeconds(null);
    setDuplicateDate(null);
    setError(null);
    setSelectedPlatforms(new Set(next === "post" ? connectedPlatforms : reelPlatforms));
  };

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    setError(null);
    const pickedVideo = picked.type === "video/mp4" || picked.type === "video/quicktime";
    if (kind === "reel" && !pickedVideo) {
      setError("Choose an MP4 or MOV video for a Reel.");
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
    setFile(picked);
    setDuplicateDate(existingByFilename.get(picked.name) ?? null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
  };

  const previewPlatform = [...selectedPlatforms][0] ?? connectedPlatforms[0];
  const PreviewIcon = previewPlatform ? PLATFORM_ICONS[previewPlatform] : null;

  const onSubmit = async () => {
    if (!file) {
      setError(kind === "reel" ? "Choose a video first." : kind === "story" ? "Choose an image or a video first." : "Choose an image first.");
      return;
    }
    if (kind !== "post" && reelPlatforms.length === 0) {
      setError(`${kind === "reel" ? "Reels" : "Stories"} go to Facebook and Instagram — connect one of them for this project first.`);
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
    }
    if (duplicateDate) {
      setError(`"${file.name}" is already scheduled for ${duplicateDate} — choose a different file.`);
      return;
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
      const mediaKey = await upload(file);
      const coverKey = kind === "reel" && coverFile ? await upload(coverFile) : null;

      const fd = new FormData();
      fd.set("project_id", projectId);
      fd.set("media_key", mediaKey);
      fd.set("original_filename", file.name);
      fd.set("date", date);
      // Stories show no caption, so none is sent.
      if (kind !== "story" && caption.trim()) fd.set("caption", caption.trim());
      if (kind !== "post") {
        fd.set("post_type", kind);
        if (coverKey) fd.set("cover_key", coverKey);
        // A Reel or Story always names its platforms (Facebook and/or Instagram).
        fd.set("platforms", JSON.stringify([...selectedPlatforms].filter((p) => REEL_PLATFORMS.includes(p))));
      }
      // Only send `platforms` when it's a strict subset of every connected
      // platform — otherwise omit it so the post keeps meaning "everywhere
      // this project is connected" even if a new platform gets connected later.
      const isSubset = selectedPlatforms.size > 0 && selectedPlatforms.size < connectedPlatforms.length;
      if (kind === "post" && isSubset) fd.set("platforms", JSON.stringify([...selectedPlatforms]));
      const result = await createPlannerPost(fd);
      if (result?.error) throw new Error(result.error);
      onClose();
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
        className="w-full max-w-3xl bg-white border border-ink/10 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-ink/10">
          <div className="flex items-center gap-4">
            <p className="font-medium">
              Create {kind} — {date}
            </p>
            <div className="flex items-center gap-1 rounded-lg border border-ink/15 p-1" role="tablist" aria-label="What to create">
              {(["post", "reel", "story"] as const).map((k) => (
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
                  {k}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-subtle hover:text-ink text-small">
            Close
          </button>
        </div>

        {connectedPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-4">
            {connectedPlatforms.map((platform) => {
              const Icon = PLATFORM_ICONS[platform];
              const unavailable = kind !== "post" && !REEL_PLATFORMS.includes(platform);
              const active = !unavailable && selectedPlatforms.has(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  disabled={busy || unavailable}
                  title={unavailable ? "Reels and stories go to Facebook and Instagram for now" : undefined}
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
                  : kind === "reel"
                    ? "Drag & drop or click to choose a video (MP4/MOV, 9:16)"
                    : kind === "story"
                      ? "Drag & drop or click to choose a 9:16 image or video (up to 60s)"
                      : "Drag & drop or click to choose an image"}
              </p>
              <input
                key={kind}
                type="file"
                accept={
                  kind === "reel"
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

            {kind === "story" && (
              <p className="text-tag text-ink-subtle">
                Stories show no caption and last 24 hours. Links, polls and music stickers can&apos;t be added through the API.
                {videoSeconds != null && ` Length ${Math.round(videoSeconds)}s (3–60s allowed).`}
              </p>
            )}
            {kind === "reel" && (
              <>
                {videoSeconds != null && (
                  <p className="text-tag text-ink-subtle">
                    Length {Math.round(videoSeconds)}s · Facebook takes 3–90s, Instagram up to 15 min.
                  </p>
                )}
                <label className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 px-3 py-2 text-small cursor-pointer">
                  <span className="text-ink-muted truncate">
                    {coverFile ? `Cover: ${coverFile.name}` : "Cover image (optional — otherwise the first frame)"}
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
              </>
            )}

            {duplicateDate && (
              <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
                &quot;{file?.name}&quot; is already scheduled for {duplicateDate} — choose a different image.
              </p>
            )}

            {kind !== "story" && (
              <div>
                <textarea
                  className={inputClasses}
                  rows={5}
                  placeholder="Write a caption…"
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
            {previewPlatform === "tiktok" || kind !== "post" ? (
              <div className="relative w-full max-w-[220px] aspect-[9/16] rounded-2xl bg-ink overflow-hidden">
                {previewUrl && file?.type.startsWith("video/") ? (
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
          <button type="button" onClick={onSubmit} disabled={busy || !!duplicateDate} className={buttonStyles.primary}>
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 5=Fri … 6=Sat
}

/** Assigns each filename a date starting from `startDate`, one per day —
 *  except any filename containing "Friday" (Shoaib's own naming convention
 *  for recurring Jummah/Friday content), which is held back for the next
 *  actual Friday instead of just falling wherever it lands in sequence.
 *  Everything else fills in around those Fridays in filename order. A
 *  Friday with no Friday-named file left stays empty on purpose — Shoaib
 *  adds something there himself rather than a regular file filling the
 *  gap automatically. */
/** `occupiedDates` — dates that already have at least one post — are
 *  skipped entirely (for both the Friday and regular queues) so a new bulk
 *  batch fills whatever gaps already exist in the calendar first, then
 *  continues into fresh dates once those run out, rather than stacking a
 *  second post onto a day some earlier batch (or a manual add) already used. */
function planBulkDates(fileNames: string[], startDate: string, occupiedDates: Set<string>): string[] {
  const fridayIdx: number[] = [];
  const otherIdx: number[] = [];
  fileNames.forEach((name, i) => (/friday/i.test(name) ? fridayIdx : otherIdx).push(i));

  const dates = new Array<string>(fileNames.length);
  let cursor = startDate;
  let fi = 0;
  let oi = 0;
  while (fi < fridayIdx.length || oi < otherIdx.length) {
    if (!occupiedDates.has(cursor)) {
      if (dayOfWeek(cursor) === 5) {
        if (fi < fridayIdx.length) dates[fridayIdx[fi++]] = cursor;
        // else: leave this Friday empty rather than using a regular file.
      } else if (oi < otherIdx.length) {
        dates[otherIdx[oi++]] = cursor;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

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
  existingByFilename,
  onClose,
}: {
  projectId: string;
  connectedPlatforms: string[];
  /** Dates that already have at least one post — gap-filled before the
   *  batch spills into fresh dates. */
  occupiedDates: Map<string, unknown>;
  /** Filename → date it's already scheduled on — files matching one of
   *  these are skipped rather than re-uploaded as a duplicate. */
  existingByFilename: Map<string, string>;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Same "post to" selection as the single-post composer — applied to
  // every file in the batch, since a bulk upload has no per-image UI.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(connectedPlatforms));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      // Skip any file that's already been uploaded before (e.g. Shoaib
      // re-selecting the same content-pack folder) instead of creating a
      // duplicate post — surfaced afterward as its already-scheduled date.
      const alreadyScheduled: { name: string; date: string }[] = [];
      const fileArr = sorted.filter((file) => {
        const existingDate = existingByFilename.get(file.name);
        if (existingDate) {
          alreadyScheduled.push({ name: file.name, date: existingDate });
          return false;
        }
        return true;
      });

      const dates = planBulkDates(fileArr.map((f) => f.name), startDate, new Set(occupiedDates.keys()));
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
        fd.set("date", dates[i]);
        if (isSubset) fd.set("platforms", JSON.stringify([...selectedPlatforms]));
        const result = await createPlannerPost(fd);
        if (result?.error) throw new Error(result.error);
      }

      if (alreadyScheduled.length > 0) {
        const list = alreadyScheduled.map((s) => `${s.name} (already on ${s.date})`).join(", ");
        setStatus(`Uploaded ${fileArr.length} new file(s). Skipped ${alreadyScheduled.length} already scheduled: ${list}`);
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
