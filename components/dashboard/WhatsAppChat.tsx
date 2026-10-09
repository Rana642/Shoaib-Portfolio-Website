"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, Hand, LoaderCircle, Search, Send, X } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { DEAL_WORDS, type BusinessKind } from "@/lib/whatsapp/words";
import { TemplatePicker, type TemplateActions } from "@/components/whatsapp/Templates";

type Result = { error?: string; ok?: boolean } | undefined;
type ChatPatch = { handoff?: "intervene" | "resolve"; tags?: string[]; notes?: string };

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
  quickReplies = [],
  templates,
}: {
  windowOpen: boolean;
  onSend: (text: string) => Promise<Result>;
  quickReplies?: { id: string; title: string; body: string }[];
  /** Approved message templates — the only way to write after the 24 h window. */
  templates?: TemplateActions;
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
      <div className="grid gap-2">
        <p className="text-small text-ink-muted">
          The 24-hour reply window has closed — a normal reply can&apos;t be sent until the customer messages again.
          {templates && " You can still send an approved template."}
        </p>
        {templates && (
          <div>
            <TemplatePicker actions={templates} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {templates && (
        <div className="mb-2">
          <TemplatePicker actions={templates} label="Template" />
        </div>
      )}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickReplies.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setText((t) => (t.trim() ? `${t.trimEnd()}\n\n${q.body}` : q.body))}
              className="rounded-full border border-ink/15 px-2.5 py-1 text-tag hover:bg-ink/5"
              title={q.body}
            >
              {q.title}
            </button>
          ))}
        </div>
      )}
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


/** "Mark as booked / won" — item, date, quantity, amount. Feeds Bookings + reports. */
export function BookingForm({
  booking,
  booked,
  onSave,
  compact = false,
  kind = "general",
}: {
  booking: BookingDetails | null;
  booked: boolean;
  onSave: (formData: FormData) => Promise<Result>;
  /** Narrow column (the Contact Profile panel): fields stack two per row. */
  compact?: boolean;
  kind?: BusinessKind;
}) {
  const w = DEAL_WORDS[kind];
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonStyles.secondary} !py-1.5 text-small`}>
        {booked ? `${w.done}${booking?.amount ? `: Rs ${booking.amount.toLocaleString("en-PK")}` : ""} · edit` : w.mark}
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
      className={`w-full grid gap-2 items-end ${compact ? "grid-cols-2 [&>label:first-child]:col-span-2 [&>label:nth-child(5)]:col-span-2 [&>div]:col-span-2" : "sm:grid-cols-[1fr_150px_90px_120px_150px_auto]"}`}
    >
      <label className="text-tag">
        {w.item}
        <input name="room" defaultValue={booking?.room ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        {w.date}
        <input name="check_in" type="date" defaultValue={booking?.check_in ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        {w.qty}
        <input name="nights" type="number" min={1} defaultValue={booking?.nights ?? 1} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag">
        Amount (Rs)
        <input name="amount" inputMode="numeric" defaultValue={booking?.amount ?? ""} className={`${inputClasses} !py-1.5`} />
      </label>
      <label className="text-tag" title={w.refTitle}>
        {w.ref}
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
      {error && <p className="col-span-full text-small text-red-700">{error}</p>}
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
      className="rounded-md border border-ink/15 bg-white px-1.5 py-1 text-tag font-sans tracking-normal max-w-[10rem]"
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
  kind = "general",
}: {
  status: string;
  onChange: (status: string) => Promise<Result>;
  kind?: BusinessKind;
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
      <option value="booked">{DEAL_WORDS[kind].won}</option>
      <option value="lost">{DEAL_WORDS[kind].lost}</option>
    </select>
  );
}

/** Intervene (staff takes over, automation pauses) / Resolve (hand back to automation). */
export function HandoffButton({ intervened, onUpdate }: { intervened: boolean; onUpdate: (patch: ChatPatch) => Promise<Result> }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await onUpdate({ handoff: intervened ? "resolve" : "intervene" });
          router.refresh();
        })
      }
      className={`${intervened ? buttonStyles.secondary : buttonStyles.primary} !py-1.5 text-small`}
      title={intervened ? "Hand the chat back to the automation" : "Take over this chat — automation pauses"}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : intervened ? (
        <CheckCheck className="size-4" aria-hidden />
      ) : (
        <Hand className="size-4" aria-hidden />
      )}
      {intervened ? "Resolve" : "Intervene"}
    </button>
  );
}

/** Add / remove tags on a chat (e.g. "VIP", "Corporate", "Family"). */
export function TagEditor({ tags, onUpdate }: { tags: string[]; onUpdate: (patch: ChatPatch) => Promise<Result> }) {
  const [list, setList] = useState(tags);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();
  const save = (next: string[]) => {
    setList(next);
    start(async () => {
      await onUpdate({ tags: next });
    });
  };
  const add = () => {
    const t = draft.trim().slice(0, 30);
    if (t && !list.includes(t)) save([...list, t]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-cobalt/10 border border-cobalt/30 px-2 py-0.5 text-tag">
            {t}
            <button type="button" onClick={() => save(list.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="hover:text-red-700">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Add a tag + Enter"
        className={`${inputClasses} !py-1.5 text-small mt-2`}
      />
    </div>
  );
}

/** Private notes about the customer — saved when the box loses focus. */
export function NotesBox({ notes, onUpdate }: { notes: string | null; onUpdate: (patch: ChatPatch) => Promise<Result> }) {
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(notes ?? "");
  const [pending, start] = useTransition();
  return (
    <div>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value === saved) return;
          start(async () => {
            const r = await onUpdate({ notes: value });
            if (!r?.error) setSaved(value);
          });
        }}
        placeholder="Only your team sees this"
        className={`${inputClasses} resize-y text-small`}
      />
      <p className="text-tag text-ink-subtle mt-1 h-4">{pending ? "Saving…" : value !== saved ? "Unsaved — click outside to save" : ""}</p>
    </div>
  );
}

export type Scope = { param: string; allLabel?: string; options: { value: string; label: string }[] };

/** Business switcher + search by name/number + filter by where the customer came from; keeps the other URL params. */
export function InboxFilters({ sources, scope }: { sources: { value: string; label: string }[]; scope?: Scope }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const go = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("chat");
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex items-center gap-2 w-full">
      {scope && (
        <select
          aria-label="Business"
          value={params.get(scope.param) ?? (scope.allLabel ? "" : scope.options[0]?.value)}
          onChange={(e) => {
            const next = new URLSearchParams();
            if (e.target.value) next.set(scope.param, e.target.value);
            router.push(next.size ? `${pathname}?${next.toString()}` : pathname);
          }}
          className={`${inputClasses} !w-40 sm:!w-52 shrink-0 !py-2 text-small font-medium`}
        >
          {scope.allLabel && <option value="">{scope.allLabel}</option>}
          {scope.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <form
        className="relative flex-1 min-w-0 max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          go("q", q.trim());
        }}
      >
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or mobile number"
          className={`${inputClasses} !py-2 !pl-9 text-small`}
        />
      </form>
      <select
        aria-label="Filter by source"
        value={params.get("src") ?? ""}
        onChange={(e) => go("src", e.target.value)}
        className={`${inputClasses} !w-32 sm:!w-auto shrink-0 !py-2 text-small`}
      >
        <option value="">All sources</option>
        {sources.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
