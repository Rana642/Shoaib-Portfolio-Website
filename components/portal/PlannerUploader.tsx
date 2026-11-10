"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check, ImageUp, LoaderCircle, Send, X } from "lucide-react";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { createPortalUploads } from "@/lib/portal/planner";
import { portalConfirmNewPost, portalCreatePost, type PortalNewPostResult } from "@/lib/portal/post-actions";
import type { Finding } from "@/lib/post-preflight-checks";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

type Picked = { file: File; preview: string };

/** The client's upload: final graphics + the day they should go out. Each
 *  file goes straight to storage (presigned PUT), then becomes a planner
 *  post waiting for its caption. */
export default function PlannerUploader({
  projectId,
  defaultDate,
  onDone,
  canSchedule = false,
  canPublish = false,
}: {
  projectId: string;
  defaultDate: string;
  /** "Edit posts": one graphic with the client's own caption, scheduled. */
  canSchedule?: boolean;
  /** "Publish now": one graphic with the client's own caption, out at once. */
  canPublish?: boolean;
  /** Called after a successful upload (the planner's "Add" dialog closes). */
  onDone?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [date, setDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [caption, setCaption] = useState("");
  const [time, setTime] = useState("");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Free the preview object URLs when they're no longer shown.
  useEffect(() => () => picked.forEach((p) => URL.revokeObjectURL(p.preview)), [picked]);

  const add = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    setDone(null);
    const next: Picked[] = [];
    for (const file of Array.from(files)) {
      if (!TYPES.includes(file.type)) {
        setError(`"${file.name}" isn't a JPG, PNG or WebP image.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" is over 25 MB.`);
        continue;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setPicked((prev) => [...prev, ...next].slice(0, 30));
  };

  const upload = async () => {
    setError(null);
    setDone(null);
    if (!picked.length) return setError("Choose at least one image.");
    if (!date) return setError("Pick the day it should go out.");
    setBusy(true);
    const uploaded: { key: string; name: string }[] = [];
    try {
      for (const [i, { file }] of picked.entries()) {
        setProgress(`Uploading ${i + 1} of ${picked.length}…`);
        const res = await fetch("/api/portal/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size, projectId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!put.ok) throw new Error(`Couldn't upload "${file.name}".`);
        uploaded.push({ key: data.key, name: file.name });
      }
      setProgress("Adding to the planner…");
      const res = await createPortalUploads({ projectId, date, note: note.trim() || null, files: uploaded });
      if ("error" in res && res.error) throw new Error(res.error);
      const added = "created" in res && typeof res.created === "number" ? res.created : uploaded.length;
      const repeats = "repeats" in res && Array.isArray(res.repeats) ? res.repeats : [];
      setDone(`${added} graphic${added === 1 ? "" : "s"} added to the planner.${repeats.length ? ` Already there, not added again: ${repeats.join(", ")}.` : ""}`);
      setPicked([]);
      setNote("");
      router.refresh();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // One graphic with the client's own caption: Schedule ("Edit posts") or
  // Publish now ("Publish now"), with the dashboard's checks (lib/portal/post-actions.ts).
  const ownCaption = canSchedule || canPublish;
  const finish = (res: PortalNewPostResult) => {
    if (res.status === "error") return setError(res.message);
    if (res.status === "blocked") {
      setFindings(res.findings);
      setError("Not scheduled: fix the caption first. The graphic is on the planner, waiting for a caption. (Pehle caption theek karein.)");
      setPicked([]);
      router.refresh();
      return;
    }
    if (res.status === "confirm") {
      setFindings(res.findings);
      setConfirmId(res.postId);
      setDone("Look at these before it goes out. (Bhejne se pehle dekh lein.)");
      setPicked([]);
      router.refresh();
      return;
    }
    setConfirmId(null);
    setPicked([]);
    setCaption("");
    setTime("");
    router.refresh();
    if (res.status === "published") {
      setFindings(null);
      setDone(res.ok ? "Published." : (res.note ?? "Published, but some platforms failed."));
      return;
    }
    setFindings(res.findings.length ? res.findings : null);
    setDone(res.findings.length ? "Scheduled. Look at the notes below." : "Scheduled.");
    if (!res.findings.length) onDone?.();
  };

  const sendOne = async (action: "schedule" | "publish") => {
    setError(null);
    setDone(null);
    setFindings(null);
    if (picked.length !== 1) return setError("Schedule and Publish now work with one graphic at a time.");
    if (!caption.trim()) return setError("Write a caption first.");
    if (!date) return setError("Pick the day it should go out.");
    setBusy(true);
    try {
      const file = picked[0].file;
      setProgress("Uploading…");
      const res = await fetch("/api/portal/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Couldn't upload "${file.name}".`);
      setProgress(action === "publish" ? "Publishing…" : "Scheduling…");
      finish(await portalCreatePost({ projectId, file: { key: data.key, name: file.name }, date, time: time || null, caption, action }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const publishAnyway = async () => {
    if (!confirmId) return;
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress("Publishing…");
    try {
      finish(await portalConfirmNewPost(confirmId, caption));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card variant="solid" className="p-5 md:p-6">
      <h2 className="text-body-lg font-semibold">Upload graphics</h2>
      <p className="text-small text-ink-muted mt-1">
        Final, approved images only — they go straight onto the planner, and I&apos;ll add the captions.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-7 text-center cursor-pointer transition-colors ${
          dragging ? "border-citrus bg-citrus/10" : "border-ink/20 hover:border-citrus hover:bg-citrus/[0.04]"
        }`}
      >
        <ImageUp className="size-6 text-ink-subtle" aria-hidden />
        <p className="text-small text-ink-muted">Drag images here, or click to choose</p>
        <p className="text-xs text-ink-subtle">JPG, PNG or WebP — up to 25 MB each</p>
      </div>

      {picked.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
          {picked.map((p, i) => (
            <li key={p.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.file.name} className="w-full aspect-square rounded-lg object-cover border border-ink/10" />
              <button
                type="button"
                onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove ${p.file.name}`}
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center size-6 rounded-full bg-ink text-cloud cursor-pointer"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)] gap-4 mt-5">
        <Field label="Post on" htmlFor="upload-date" hint="I can move it if needed.">
          <input id="upload-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} />
        </Field>
        <Field label="Note for me (optional)" htmlFor="upload-note">
          <input
            id="upload-note"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Eid offer — mention free delivery"
            className={inputClasses}
          />
        </Field>
      </div>

      {ownCaption && picked.length <= 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)] gap-4 mt-4">
          <Field label="Time (optional)" htmlFor="upload-time" hint="Pakistan time. Empty = the usual slot.">
            <input id="upload-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Caption (for Schedule or Publish now)" htmlFor="upload-caption" hint="Leave it empty and press Upload if I should write it.">
            <textarea id="upload-caption" rows={4} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} className={inputClasses} />
          </Field>
        </div>
      )}

      {findings && (
        <ul className="mt-4 space-y-1.5 rounded-lg border border-ink/10 p-3">
          {findings.map((f) => (
            <li key={f.code + f.en} className={`text-small flex gap-1.5 ${f.severity === "fix" ? "text-red-700" : "text-orange-800"}`}>
              <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                {f.en} <span className="text-ink-muted">({f.ur})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">{error}</p>}
      {done && (
        <p className="flex items-center gap-2 text-small mt-4">
          <Check className="size-4 text-forest" aria-hidden />
          {done}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        {confirmId ? (
          <button type="button" onClick={publishAnyway} disabled={busy} className={buttonStyles.primary}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            {progress ?? "Publish anyway"}
          </button>
        ) : (
          <>
            <button type="button" onClick={upload} disabled={busy || picked.length === 0} className={ownCaption ? buttonStyles.secondary : buttonStyles.primary}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
              {progress ?? (picked.length > 1 ? `Upload ${picked.length} graphics` : "Upload")}
            </button>
            {canSchedule && picked.length <= 1 && (
              <button type="button" onClick={() => sendOne("schedule")} disabled={busy || picked.length !== 1 || !caption.trim()} className={buttonStyles.primary}>
                <CalendarClock className="size-4" aria-hidden />
                Schedule
              </button>
            )}
            {canPublish && picked.length <= 1 && (
              <button type="button" onClick={() => sendOne("publish")} disabled={busy || picked.length !== 1 || !caption.trim()} className={buttonStyles.primary}>
                <Send className="size-4" aria-hidden />
                Publish now
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
