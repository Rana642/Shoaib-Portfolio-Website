"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";

type Result = { error?: string; ok?: boolean } | undefined;

/** Paste a hotel site's Supabase URL + key. The key field is write-only. */
export default function BookingSourceForm({
  connected,
  kind,
  url,
  onSave,
  onRemove,
}: {
  connected: boolean;
  kind: string | null;
  url: string | null;
  onSave: (formData: FormData) => Promise<Result>;
  onRemove: () => Promise<Result>;
}) {
  const [open, setOpen] = useState(!connected);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-small">
        <span className="text-green-700">Website bookings connected</span>
        <span className="text-ink-subtle font-mono">{url}</span>
        <button type="button" onClick={() => setOpen(true)} className="underline underline-offset-4">
          Change
        </button>
        <button
          type="button"
          onClick={() => start(async () => void (await onRemove()))}
          className="underline underline-offset-4 text-red-700"
        >
          Disconnect
        </button>
      </div>
    );
  }
  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await onSave(fd);
          setMsg(r?.error ? { ok: false, text: r.error } : { ok: true, text: "Connected." });
          if (!r?.error) setOpen(false);
        })
      }
      className="grid gap-3 sm:grid-cols-[160px_1fr_1fr_auto] items-end"
    >
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Hotel site</span>
        <select name="kind" defaultValue={kind ?? "silver_sand"} className={inputClasses}>
          <option value="silver_sand">Silver Sand type</option>
          <option value="elegant">Elegant type</option>
        </select>
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Supabase URL</span>
        <input name="supabase_url" defaultValue={url ?? ""} placeholder="https://xxxx.supabase.co" className={inputClasses} />
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Service key (stored encrypted)</span>
        <input name="key" type="password" autoComplete="off" className={inputClasses} />
      </label>
      <button type="submit" disabled={pending} className={buttonStyles.secondary}>
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Connect
      </button>
      {msg && <p className={`sm:col-span-4 text-small ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}
