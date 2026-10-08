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
