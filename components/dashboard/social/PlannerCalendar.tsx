"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Trash2, LoaderCircle, UploadCloud } from "lucide-react";
import { createPlannerPost, deletePost, movePost } from "@/lib/dashboard/actions/social";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ProjectOption, ScheduledPost } from "@/lib/dashboard/types";

type PostWithUrl = ScheduledPost & { imageUrl: string | null };
type ViewMode = "week" | "month";

const STATUS_RING: Record<string, string> = {
  pending_caption: "ring-citrus",
  scheduled: "ring-cobalt",
  posted: "ring-green-600",
  failed: "ring-red-600",
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
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  posts: PostWithUrl[];
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
        <UploadModal date={uploadDate} projectId={selectedProjectId} onClose={() => setUploadDate(null)} />
      )}
      {bulkOpen && <BulkUploadModal projectId={selectedProjectId} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function WeekPostCard({ post }: { post: PostWithUrl }) {
  const [pending, startTransition] = useTransition();
  const ring = STATUS_RING[post.status] ?? "ring-ink/20";

  return (
    <div
      className="relative group rounded-lg border border-ink/10 overflow-hidden cursor-grab active:cursor-grabbing bg-white"
      title={post.caption ?? post.original_filename}
      draggable
      onDragStart={(e) => e.dataTransfer.setData(DRAG_MIME, post.id)}
    >
      {post.scheduled_at && (
        <p className="text-tag text-ink-subtle px-2 pt-1.5">{timeLabel(post.scheduled_at)}</p>
      )}
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

function UploadModal({ date, projectId, onClose }: { date: string; projectId: string; onClose: () => void }) {
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    let done = 0;
    try {
      const fileArr = Array.from(files);
      for (const file of fileArr) {
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
        fd.set("date", date);
        // Spread same-day posts ~45 min apart rather than back-to-back —
        // Meta's anti-spam systems watch for bot-like, tightly-clustered
        // posting cadence on Pages, so same-day posts shouldn't land seconds
        // apart even though nothing technically stops it.
        fd.set("offset_minutes", String(done * 45));
        if (caption.trim()) fd.set("caption", caption.trim());
        const result = await createPlannerPost(fd);
        if (result?.error) throw new Error(result.error);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 space-y-4 bg-white border border-ink/10 rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="font-medium">Add post — {date}</p>
          <p className="text-small text-ink-muted mt-1">
            Caption is optional here — leave it blank and tell Claude in chat to write it later.
          </p>
        </div>

        <textarea
          className={inputClasses}
          rows={3}
          placeholder="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={busy}
        />

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

/** Bulk import: pick a start date and drop in a whole batch (e.g. a
 *  client's 30-day content pack) — each file lands on the next consecutive
 *  day, one per day, in the order the files were selected. No caption field
 *  here since every image needs its own — those get written later (tell
 *  Claude in chat, or via the pending-caption MCP tools). Wrong day after
 *  auto-fill (a Friday post, an event post)? Just drag it to the right one. */
function BulkUploadModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    let done = 0;
    try {
      // Sort by filename so a naturally-numbered pack (day01, day02, ...)
      // lands in the right order — selection order in a file picker isn't
      // guaranteed to match visual/alphabetical order across browsers.
      const fileArr = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const file of fileArr) {
        const dayIndex = done;
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
        fd.set("date", addDays(startDate, dayIndex));
        const result = await createPlannerPost(fd);
        if (result?.error) throw new Error(result.error);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md p-6 space-y-4 bg-white border border-ink/10 rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="font-medium">Bulk upload</p>
          <p className="text-small text-ink-muted mt-1">
            One post per day, starting from the date below, in filename order. Drag any post afterward to
            move it to a different day.
          </p>
        </div>

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
