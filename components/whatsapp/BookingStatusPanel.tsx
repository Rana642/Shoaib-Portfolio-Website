"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, StickyNote } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { BOOKING_STATUSES } from "@/lib/booking-status";

type Result = { error?: string; ok?: boolean } | undefined;

/** Update status + internal notes — written to the hotel's own system. */
export default function BookingStatusPanel({
  current,
  notes,
  notesLabel,
  onStatus,
  onNotes,
}: {
  current: string;
  notes: string | null;
  notesLabel: string;
  onStatus: (status: string) => Promise<Result>;
  onNotes: (notes: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(current);
  const [note, setNote] = useState(notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<Result>, ok: string, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res?.error) return setMsg({ ok: false, text: res.error });
      after?.();
      setMsg({ ok: true, text: ok });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="text-small font-semibold mb-3">Update Status</p>
        <div className="flex flex-wrap gap-2">
          {BOOKING_STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={pending}
              onClick={() => run(() => onStatus(s.key), `Marked ${s.label}.`, () => setStatus(s.key))}
              className={`rounded-full px-3 py-1.5 text-small transition disabled:opacity-50 ${
                status === s.key ? `${s.cls} ring-2 ring-ink/30 font-semibold` : "bg-ink/5 text-ink-muted hover:bg-ink/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-tag text-ink-subtle mt-3">Cancelled{" "}/ No Show frees the room&apos;s dates in the hotel system.</p>
      </Card>

      <Card className="p-5">
        <p className="flex items-center gap-2 text-small font-semibold mb-3">
          <StickyNote className="size-4" aria-hidden /> {notesLabel}
        </p>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Staff notes (not shown to the guest)…"
          className={`${inputClasses} resize-y`}
        />
        <button type="button" disabled={pending} onClick={() => run(() => onNotes(note), "Notes saved.")} className={`${buttonStyles.primary} mt-3`}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save notes
        </button>
      </Card>

      {msg && <p className={`text-small ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
