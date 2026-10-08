"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Send } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";

type Result = { error?: string; ok?: boolean } | undefined;

/** Re-fetches the inbox every few seconds so new messages appear without a reload. */
export function InboxAutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

/** Keeps the message list pinned to the newest message. */
export function ScrollToBottom({ dep }: { dep: string | number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [dep]);
  return <div ref={ref} />;
}

/** Clears the unread badge once, when a chat is opened. */
export function MarkRead({ action }: { action: () => Promise<void> }) {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) {
      done.current = true;
      void action();
    }
  }, [action]);
  return null;
}

export function ReplyBox({
  windowOpen,
  onSend,
}: {
  windowOpen: boolean;
  onSend: (text: string) => Promise<Result>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = () => {
    if (!text.trim()) return;
    setError(null);
    start(async () => {
      const result = await onSend(text);
      if (result?.error) setError(result.error);
      else {
        setText("");
        router.refresh();
      }
    });
  };

  if (!windowOpen) {
    return (
      <p className="text-small text-ink-muted">
        The free 24-hour reply window has closed. The guest needs to message again before a normal reply can be sent.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Type a reply…  (Enter to send, Shift+Enter for a new line)"
          className={`${inputClasses} resize-none`}
        />
        <button type="button" onClick={send} disabled={pending || !text.trim()} className={buttonStyles.primary} aria-label="Send">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </button>
      </div>
      {error && <p className="text-small text-red-700 mt-2">{error}</p>}
    </div>
  );
}

export type BookingDetails = {
  room?: string | null;
  check_in?: string | null;
  nights?: number | null;
  amount?: number | null;
  hotel_ref?: string | null;
};

/** "Mark as booked" — room, check-in, nights, amount. Feeds Bookings + reports. */
export function BookingForm({
  booking,
  booked,
  onSave,
}: {
  booking: BookingDetails | null;
  booked: boolean;
  onSave: (formData: FormData) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonStyles.secondary} !py-1.5 text-small`}>
        {booked ? `Booking${booking?.amount ? `: Rs ${booking.amount.toLocaleString("en-PK")}` : ""} · edit` : "Mark as booked"}
      </button>
    );
  }
  return (
    <form
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await onSave(fd);
          if (r?.error) setError(r.error);
          else {
            setOpen(false);
            router.refresh();
          }
        });
      }}
      className="w-full grid gap-2 sm:grid-cols-[1fr_150px_90px_120px_150px_auto] items-end"
    >
      <label className="text-tag">
        Room
        <input name="room" defaultValue={booking?.room ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        Check-in
        <input name="check_in" type="date" defaultValue={booking?.check_in ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        Nights
        <input name="nights" type="number" min={1} defaultValue={booking?.nights ?? 1} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        Amount (Rs)
        <input name="amount" inputMode="numeric" defaultValue={booking?.amount ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag" title="If this booking is also entered in the hotel's admin, its ref — so it's counted once">
        Hotel booking ref
        <input name="hotel_ref" defaultValue={booking?.hotel_ref ?? ""} placeholder="optional" className={`${inputClasses} !py-1.5`} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} !py-1.5`}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${buttonStyles.secondary} !py-1.5`}>
          Cancel
        </button>
      </div>
      {error && <p className="sm:col-span-6 text-small text-red-700">{error}</p>}
    </form>
  );
}

/** Pick where a code-less booking (phone, walk-in…) came from. */
export function SourcePicker({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange: (source: string) => Promise<Result>;
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="Booking source"
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        start(async () => {
          await onChange(next);
          router.refresh();
        });
      }}
      className={`${inputClasses} !w-auto !py-1 !px-2 text-tag`}
    >
      <option value="">Set source…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StatusSelect({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: string) => Promise<Result>;
}) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Chat status"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        start(async () => {
          await onChange(next);
        });
      }}
      className={`${inputClasses} !w-auto !py-1.5 text-small`}
    >
      <option value="new">New</option>
      <option value="replied">Replied</option>
      <option value="booked">Booked</option>
      <option value="lost">Not booked</option>
    </select>
  );
}
