"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, LoaderCircle, UploadCloud, Heart, MessageCircle, Share2, Check } from "lucide-react";
import { createPlannerPost, deletePost, movePost } from "@/lib/dashboard/actions/social";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TikTokIcon } from "@/components/ui/SocialIcons";
import type { ProjectOption, ScheduledPost } from "@/lib/dashboard/types";

type PostWithUrl = ScheduledPost & { imageUrl: string | null };
type ViewMode = "week" | "month";

const STATUS_RING: Record<string, string> = {
  pending_caption: "ring-citrus",
  scheduled: "ring-cobalt",
  posted: "ring-green-600",
  failed: "ring-red-600",
};

const STATUS_LABEL: Record<string, { text: string; classes: string }> = {
  pending_caption: { text: "Needs caption", classes: "bg-citrus/15 text-ink" },
  scheduled: { text: "Scheduled", classes: "bg-cobalt/10 text-ink" },
  posted: { text: "Posted", classes: "bg-green-600/10 text-green-700" },
  failed: { text: "Failed", classes: "bg-red-600/10 text-red-700" },
};

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
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  posts: PostWithUrl[];
  /** Platforms this project has an active connected account for — drives
   *  the upload modal's "post to" checkboxes. */
  connectedPlatforms: string[];
}) {
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

  const dayDropProps = (key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverKey(key);
    },
    onDragLeave: () => setDragOverKey((cur) => (cur === key ? null : cur)),
    onDrop: (e: React.DragEvent) => onDropOnDay(key, e),
  });

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

  const headerLabel = view === "week" ? monthLabel(new Date(weekKeys[0])) : monthLabel(monthCursor);

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
            aria-label={view === "week" ? "Previous week" : "Previous month"}
            onClick={() =>
              view === "week"
                ? setWeekStart(new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() - 7)))
                : setMonthCursor(new Date(Date.UTC(year, month - 1, 1)))
            }
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
            aria-label={view === "week" ? "Next week" : "Next month"}
            onClick={() =>
              view === "week"
                ? setWeekStart(new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 7)))
                : setMonthCursor(new Date(Date.UTC(year, month + 1, 1)))
            }
            className="p-2 rounded-lg text-ink-subtle hover:text-ink hover:bg-ink/5 transition-colors"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {connectedPlatforms.length > 0 && (
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
          <select
            className={`${inputClasses} max-w-72`}
            value={selectedProjectId}
            onChange={(e) => router.push(`/dashboard/social/planner?project=${e.target.value}`)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setBulkOpen(true)} className={buttonStyles.secondary}>
            <UploadCloud className="size-4" aria-hidden />
            Bulk upload
          </button>
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
                      <WeekPostCard key={p.id} post={p} />
                    ))}
                    <button
                      type="button"
                      onClick={() => setUploadDate(key)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/15 text-ink-subtle hover:text-ink hover:border-ink/30 transition-colors py-2 text-small"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Add
                    </button>
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
                    <button
                      type="button"
                      aria-label={`Add post on ${key}`}
                      onClick={() => setUploadDate(key)}
                      className="text-ink-subtle hover:text-ink transition-colors"
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {dayPosts.map((p) => (
                      <DayPostThumb key={p.id} post={p} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {uploadDate && (
        <UploadModal
          date={uploadDate}
          projectId={selectedProjectId}
          connectedPlatforms={connectedPlatforms}
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

function WeekPostCard({ post }: { post: PostWithUrl }) {
  const [pending, startTransition] = useTransition();
  const ring = STATUS_RING[post.status] ?? "ring-ink/20";
  const label = STATUS_LABEL[post.status];

  return (
    <div
      className="relative group rounded-lg border border-ink/10 overflow-hidden cursor-grab active:cursor-grabbing bg-white"
      title={post.caption ?? post.original_filename}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, post.id)}
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
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt="" className={cn("w-full aspect-square rounded object-cover ring-2", ring)} />
        ) : (
          <div className={cn("w-full aspect-square rounded bg-ink/10 ring-2", ring)} />
        )}
      </div>
      {post.caption && (
        <p className="text-tag text-ink-muted px-2 pb-1.5 line-clamp-2">{post.caption}</p>
      )}
      <button
        type="button"
        aria-label="Remove post"
        disabled={pending}
        onClick={() => startTransition(() => deletePost(post.id))}
        className="absolute top-1 right-1 hidden group-hover:flex items-center justify-center size-5 rounded-full bg-ink text-cloud"
      >
        {pending ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Trash2 className="size-3" aria-hidden />}
      </button>
    </div>
  );
}

function DayPostThumb({ post }: { post: PostWithUrl }) {
  const [pending, startTransition] = useTransition();
  const ring = STATUS_RING[post.status] ?? "ring-ink/20";

  return (
    <div
      className="relative group cursor-grab active:cursor-grabbing"
      title={post.caption ?? post.original_filename}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, post.id)}
    >
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt="" className={cn("size-9 rounded object-cover ring-2", ring)} />
      ) : (
        <div className={cn("size-9 rounded bg-ink/10 ring-2", ring)} />
      )}
      <button
        type="button"
        aria-label="Remove post"
        disabled={pending}
        onClick={() => startTransition(() => deletePost(post.id))}
        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center size-4 rounded-full bg-ink text-cloud"
      >
        {pending ? <LoaderCircle className="size-2.5 animate-spin" aria-hidden /> : <Trash2 className="size-2.5" aria-hidden />}
      </button>
    </div>
  );
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

const PLATFORM_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  tiktok: TikTokIcon,
};

/** One post, one image, composed with an explicit "which channels" step and
 *  a live preview — modeled on Buffer/Metricool's composer (Shoaib's
 *  reference) rather than the original bare "pick a file" flow. Multi-file
 *  batches still go through Bulk upload; this is for a single, deliberate post. */
function UploadModal({
  date,
  projectId,
  connectedPlatforms,
  onClose,
}: {
  date: string;
  projectId: string;
  connectedPlatforms: string[];
  onClose: () => void;
}) {
  const [caption, setCaption] = useState("");
  // Defaults to every connected platform selected — matches the original
  // "one image goes everywhere" behavior unless something's deselected.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(connectedPlatforms));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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

  const pickFile = (picked: File | null) => {
    if (!picked) return;
    setError(null);
    setFile(picked);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(picked);
    });
  };

  const previewPlatform = [...selectedPlatforms][0] ?? connectedPlatforms[0];
  const PreviewIcon = previewPlatform ? PLATFORM_ICONS[previewPlatform] : null;

  const onSubmit = async () => {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (connectedPlatforms.length > 0 && selectedPlatforms.size === 0) {
      setError("Select at least one platform to post to.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setStatus(`Uploading ${file.name}…`);
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
      fd.set("date", date);
      if (caption.trim()) fd.set("caption", caption.trim());
      // Only send `platforms` when it's a strict subset of every connected
      // platform — otherwise omit it so the post keeps meaning "everywhere
      // this project is connected" even if a new platform gets connected later.
      const isSubset = selectedPlatforms.size > 0 && selectedPlatforms.size < connectedPlatforms.length;
      if (isSubset) fd.set("platforms", JSON.stringify([...selectedPlatforms]));
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <p className="font-medium">Create post — {date}</p>
          <button type="button" onClick={onClose} className="text-ink-subtle hover:text-ink text-small">
            Close
          </button>
        </div>

        {connectedPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 px-6 pt-4">
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
                {file ? file.name : "Drag & drop or click to choose an image"}
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>

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
          </div>

          {/* Right: live preview — TikTok/Instagram Reels-style content is a
              full-bleed vertical video frame; a Facebook/Instagram/LinkedIn
              FEED post looks nothing like that (square image, caption below,
              not overlaid), so the mockup shape follows whichever platform
              is actually selected instead of one universal look. */}
          <div className="flex flex-col items-center">
            <p className="text-tag uppercase tracking-widest text-ink-subtle mb-2 self-start">Preview</p>
            {previewPlatform === "tiktok" ? (
              <div className="relative w-full max-w-[220px] aspect-[9/16] rounded-2xl bg-ink overflow-hidden">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-cloud/40 text-small">
                    No image yet
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
