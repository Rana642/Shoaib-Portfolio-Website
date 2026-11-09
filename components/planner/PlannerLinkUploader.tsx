"use client";

import { useRef, useState } from "react";

type Result = { name: string; ok: boolean; text?: string; error?: string };

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
const MB = 1024 * 1024;

/** Browser → R2 direct upload for a planner upload link (presign, PUT, then one "complete" per file). */
export default function PlannerLinkUploader({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  async function post(payload: object) {
    const res = await fetch("/api/planner/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Something went wrong.");
    return json;
  }

  async function upload() {
    if (files.length === 0 || busy) return;
    const tooBig = files.find((f) => f.size > (f.type.startsWith("video/") ? 100 : 25) * MB);
    if (tooBig) {
      setError(`"${tooBig.name}" is too big (pictures 25 MB, videos 100 MB).`);
      return;
    }
    setBusy(true);
    setError(null);
    setResults(null);
    const done: Result[] = [];
    try {
      const { uploads } = (await post({
        action: "presign",
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      })) as { uploads: { name: string; key: string; type: string; url: string }[] };

      for (let i = 0; i < uploads.length; i++) {
        setStatus(`Uploading ${files[i].name} (${i + 1}/${uploads.length})…`);
        try {
          const put = await fetch(uploads[i].url, { method: "PUT", headers: { "Content-Type": uploads[i].type }, body: files[i] });
          if (!put.ok) throw new Error("The upload didn't go through.");
          setStatus(`Checking ${files[i].name} and adding it to the planner…`);
          done.push((await post({ action: "complete", file: { name: uploads[i].name, key: uploads[i].key, index: i, count: uploads.length } })) as Result);
        } catch (e) {
          done.push({ name: files[i].name, ok: false, error: e instanceof Error ? e.message : "Upload failed." });
        }
        setResults([...done]);
      }
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-4">
      <label className="block rounded-xl border-2 border-dashed border-ink/20 bg-white px-5 py-10 text-center cursor-pointer hover:border-citrus transition-colors">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []).slice(0, 10));
            setResults(null);
            setError(null);
          }}
        />
        <span className="text-body font-medium">Choose pictures or videos</span>
        <span className="block text-small text-ink-muted mt-1">JPG, PNG or WebP up to 25 MB · MP4 or MOV up to 100 MB · up to 10 files</span>
      </label>

      {files.length > 0 && (
        <ul className="text-small space-y-1">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex justify-between gap-3 rounded-lg bg-ink/[0.05] px-3 py-1.5">
              <span className="truncate">{f.name}</span>
              <span className="text-ink-muted shrink-0">{(f.size / MB).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={upload}
        disabled={busy || files.length === 0}
        className="w-full rounded-full bg-ink text-white px-6 py-3 text-body font-medium disabled:opacity-40"
      >
        {busy ? "Uploading…" : "Add to the planner"}
      </button>

      {status && <p className="text-small text-ink-muted" aria-live="polite">{status}</p>}
      {error && <p role="alert" className="text-small text-red-600">{error}</p>}

      {results && results.length > 0 && (
        <div className="rounded-xl bg-white border border-ink/10 p-4 space-y-2" aria-live="polite">
          <p className="text-body font-medium">{results.every((r) => r.ok) ? "Added to the planner." : "Finished with some problems:"}</p>
          <ul className="text-small space-y-2 break-words">
            {results.map((r) => (
              <li key={r.name}>
                <span className="font-medium">{r.ok ? "✓" : "✗"} {r.name}</span>
                <span className={r.ok ? "block text-ink-muted" : "block text-red-600"}>{r.ok ? r.text : r.error}</span>
              </li>
            ))}
          </ul>
          <p className="text-small text-ink-muted">You can go back to the chat now.</p>
        </div>
      )}
    </div>
  );
}
