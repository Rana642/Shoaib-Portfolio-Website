"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImageUp, LoaderCircle, Trash2, X } from "lucide-react";
import { replacePortalUpload, deletePortalUpload } from "@/lib/portal/planner";
import { buttonStyles } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

export type FlaggedPost = {
  id: string;
  project_id: string;
  projectName: string;
  original_filename: string;
  dayLabel: string;
  review_note: string | null;
  imageUrl: string | null;
};

/** Uploads the corrected image straight to storage (presigned PUT), then
 *  swaps it in for the flagged post — same day, same slot. */
export function ReplaceImageButton({ postId, projectId, className }: { postId: string; projectId: string; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replace = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!TYPES.includes(file.type)) return setError("Choose a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return setError("The image must be under 25 MB.");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Couldn't upload the image — please try again.");
      const done = await replacePortalUpload({ postId, file: { key: data.key, name: file.name } });
      if ("error" in done && done.error) throw new Error(done.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          void replace(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={cn(buttonStyles.primary, className)}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
        {busy ? "Uploading…" : "Replace image"}
      </button>
      {error && <span className="text-tag text-red-700">{error}</span>}
    </span>
  );
}

function RemoveButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deletePortalUpload(postId);
          router.refresh();
        })
      }
      className={buttonStyles.secondary}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      Remove
    </button>
  );
}

// "Seen this set of flags" for the browser session: sessionStorage, with an
// in-memory fallback so the popup still closes when storage is blocked.
const seenInMemory = new Set<string>();
const seenListeners = new Set<() => void>();
function subscribeSeen(onChange: () => void) {
  seenListeners.add(onChange);
  return () => void seenListeners.delete(onChange);
}
function readSeen(key: string): boolean {
  if (seenInMemory.has(key)) return true;
  try {
    return sessionStorage.getItem(key) === "seen";
  } catch {
    return false;
  }
}
function markSeen(key: string) {
  seenInMemory.add(key);
  try {
    sessionStorage.setItem(key, "seen");
  } catch {
    /* blocked — the in-memory mark is enough for this visit */
  }
  seenListeners.forEach((fn) => fn());
}

/**
 * The uploader's alarm on the portal Planner: a banner while any of their
 * uploads need changes, and a popup listing each one with what's wrong —
 * opened on arrival (once per set of flags per browser session) and from
 * the banner any time.
 */
export default function NeedsChangesAlert({ posts }: { posts: FlaggedPost[] }) {
  const flagsKey = `needs-changes:${posts.map((p) => p.id).sort().join(",")}`;
  // Pops up on arrival until this set of flags has been seen once; the
  // server render counts it as seen, so nothing flashes before hydration.
  const seen = useSyncExternalStore(subscribeSeen, () => readSeen(flagsKey), () => true);
  const [reopened, setReopened] = useState(false);
  const open = reopened || !seen;
  const setOpen = (value: boolean) => setReopened(value);

  const close = () => {
    setReopened(false);
    markSeen(flagsKey);
  };

  if (!posts.length) return null;
  const n = posts.length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-4">
        <AlertTriangle className="size-5 text-orange-700 shrink-0" aria-hidden />
        <p className="flex-1 min-w-48 text-small">
          <span className="font-semibold">
            {n} post{n === 1 ? " needs" : "s need"} a change
          </span>{" "}
          before {n === 1 ? "it can" : "they can"} be scheduled.
        </p>
        <button type="button" onClick={() => setOpen(true)} className={buttonStyles.secondary}>
          See what to fix
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="needs-changes-title"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 md:p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center size-9 rounded-full bg-orange-500/15 shrink-0">
                <AlertTriangle className="size-5 text-orange-700" aria-hidden />
              </span>
              <div className="flex-1">
                <h2 id="needs-changes-title" className="text-body-lg font-semibold">
                  {n} post{n === 1 ? " needs" : "s need"} a change
                </h2>
                <p className="text-small text-ink-muted mt-0.5">
                  I checked your uploads. Fix {n === 1 ? "this one" : "these"} and use Replace image — it keeps the same day.
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-ink/5">
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <ul className="mt-5 divide-y divide-ink/10 border-y border-ink/10">
              {posts.map((p) => (
                <li key={p.id} className="flex gap-4 py-4">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="size-24 rounded-lg object-cover ring-2 ring-orange-500 shrink-0" />
                  ) : (
                    <div className="size-24 rounded-lg bg-ink/10 ring-2 ring-orange-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-tag text-ink-subtle truncate">
                      {p.projectName} · {p.original_filename} · {p.dayLabel}
                    </p>
                    <p className="text-small mt-1">{p.review_note}</p>
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <ReplaceImageButton postId={p.id} projectId={p.project_id} />
                      <RemoveButton postId={p.id} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex justify-end mt-4">
              <button type="button" onClick={close} className={buttonStyles.secondary}>
                I&apos;ll do it later
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
