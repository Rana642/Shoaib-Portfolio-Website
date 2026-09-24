"use client";

import { useRef, useState } from "react";

type Result = { name: string; ok: boolean; url?: string; error?: string };

/** Browser → R2 direct upload (presign, PUT, complete) for the knowledge base. */
export default function KbUploader({ token, imagesOnly }: { token: string; imagesOnly: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  async function post(payload: object) {
    const res = await fetch("/api/kb/upload", {
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
    setBusy(true);
    setError(null);
    try {
      const { uploads } = (await post({
        action: "presign",
        files: files.map((f) => ({ name: f.name, type: f.type || "application/octet-stream", size: f.size })),
      })) as { uploads: { name: string; key: string; type: string; url: string }[] };

      for (let i = 0; i < uploads.length; i++) {
        const put = await fetch(uploads[i].url, { method: "PUT", headers: { "Content-Type": uploads[i].type }, body: files[i] });
        if (!put.ok) throw new Error(`Upload of ${files[i].name} failed.`);
      }
      const { results } = (await post({ action: "complete", files: uploads.map((u) => ({ name: u.name, key: u.key })) })) as { results: Result[] };
      setResults(results);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
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
          accept={imagesOnly ? "image/png,image/jpeg,image/webp,image/gif" : "image/png,image/jpeg,image/webp,image/gif,application/pdf"}
          className="sr-only"
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []).slice(0, 10));
            setResults(null);
            setError(null);
          }}
        />
        <span className="text-body font-medium">Choose {imagesOnly ? "image" : "file"}(s)</span>
        <span className="block text-small text-ink-muted mt-1">Up to 10 files, 25 MB each</span>
      </label>

      {files.length > 0 && (
        <ul className="text-small space-y-1">
          {files.map((f) => (
            <li key={f.name + f.size} className="flex justify-between gap-3 rounded-lg bg-ink/[0.05] px-3 py-1.5">
              <span className="truncate">{f.name}</span>
              <span className="text-ink-muted shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
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
        {busy ? "Uploading…" : "Upload"}
      </button>

      {error && <p role="alert" className="text-small text-red-600">{error}</p>}

      {results && (
        <div className="rounded-xl bg-white border border-ink/10 p-4 space-y-2" aria-live="polite">
          <p className="text-body font-medium">
            {results.every((r) => r.ok) ? "Done — saved to the knowledge base." : "Finished with some problems:"}
          </p>
          <ul className="text-small space-y-1 break-all">
            {results.map((r) => (
              <li key={r.name}>
                {r.ok ? "✓" : "✗"} {r.name}
                {r.ok ? (
                  <>
                    {" — "}
                    <a href={r.url} target="_blank" rel="noreferrer" className="underline">
                      link
                    </a>
                  </>
                ) : (
                  <span className="text-red-600"> — {r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-small text-ink-muted">Now tell Claude it&rsquo;s uploaded — it can list the new files and their URLs.</p>
        </div>
      )}
    </div>
  );
}
