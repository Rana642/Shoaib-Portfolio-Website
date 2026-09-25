"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  Copy,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  Printer,
  TriangleAlert,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { Card, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import { LetterheadSheet, LETTER_INK } from "@/components/dashboard/Letterhead";
import { sanitizeLetterHtml } from "@/lib/dashboard/letter-html";
import { formatLetterDate } from "@/lib/dashboard/format";
import { deleteLetter, saveLetter, type LetterInput } from "@/lib/dashboard/actions/letters";
import type { Letter } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type Status = "new" | "dirty" | "saving" | "saved" | "error";
type Fields = { title: string; date: string; showMeta: boolean };

// Typing pauses this long before the letter saves itself.
const AUTOSAVE_MS = 1200;

// Formatting is deliberately small — the body stores only what
// lib/dashboard/letter-html.ts whitelists. Groups render with a divider.
const FORMAT_GROUPS: { cmd: string; label: string; icon: LucideIcon }[][] = [
  [
    { cmd: "bold", label: "Bold (Ctrl+B)", icon: Bold },
    { cmd: "italic", label: "Italic (Ctrl+I)", icon: Italic },
    { cmd: "underline", label: "Underline (Ctrl+U)", icon: Underline },
  ],
  [
    { cmd: "insertUnorderedList", label: "Bulleted list", icon: List },
    { cmd: "insertOrderedList", label: "Numbered list", icon: ListOrdered },
  ],
  [
    { cmd: "justifyLeft", label: "Align left", icon: AlignLeft },
    { cmd: "justifyCenter", label: "Centre", icon: AlignCenter },
    { cmd: "justifyRight", label: "Align right", icon: AlignRight },
    { cmd: "justifyFull", label: "Justify", icon: AlignJustify },
  ],
];
const FORMAT_COMMANDS = FORMAT_GROUPS.flat().map((f) => f.cmd);

/**
 * A letter on the A4 letterhead: typed straight onto the sheet, saved as
 * you type, printed with the browser's print dialog. A new letter only
 * becomes a saved record (and gets its LTR reference) on its first change,
 * so opening one just to print a blank letterhead leaves nothing behind.
 */
export default function LetterEditor({ letter, today }: { letter: Letter | null; today: string }) {
  const router = useRouter();

  const [title, setTitle] = useState(letter?.title ?? "");
  const [date, setDate] = useState(letter?.letter_date ?? today);
  const [showMeta, setShowMeta] = useState(letter?.show_meta ?? true);
  const [id, setId] = useState(letter?.id ?? null);
  const [refNo, setRefNo] = useState(letter?.ref_no ?? null);
  const [status, setStatus] = useState<Status>(letter ? "saved" : "new");
  const [error, setError] = useState<string | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const [duplicating, setDuplicating] = useState(false);

  // The save loop runs outside React's render cycle, so it reads the latest
  // values from refs rather than from (possibly stale) state.
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialBodyRef = useRef(letter?.body ?? "");
  const bodyHtmlRef = useRef("");
  const fieldsRef = useRef<Fields>({ title, date, showMeta });
  const idRef = useRef(letter?.id ?? null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  const currentInput = useCallback(
    (): LetterInput => ({
      title: fieldsRef.current.title,
      letter_date: fieldsRef.current.date,
      show_meta: fieldsRef.current.showMeta,
      body: sanitizeLetterHtml(bodyHtmlRef.current),
    }),
    []
  );

  /** Saves now if anything changed; one save at a time, in order. */
  const flush = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    while (inFlightRef.current) await inFlightRef.current;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setStatus("saving");

    const run = (async () => {
      let result: Awaited<ReturnType<typeof saveLetter>>;
      try {
        result = await saveLetter(idRef.current, currentInput());
      } catch {
        result = { error: "Couldn't reach the server — check your connection." };
      }
      if ("error" in result) {
        dirtyRef.current = true;
        setError(result.error);
        setStatus("error");
        return;
      }
      setError(null);
      if (!idRef.current) {
        idRef.current = result.id;
        setId(result.id);
        setRefNo(result.ref_no);
        // Give the new letter its own URL without re-rendering the page
        // (which would reset the editor) — unless we've already left it.
        if (mountedRef.current) window.history.replaceState(null, "", `/dashboard/letterhead/${result.id}`);
      }
      setStatus(dirtyRef.current ? "dirty" : "saved");
    })();

    inFlightRef.current = run;
    try {
      await run;
    } finally {
      inFlightRef.current = null;
    }
  }, [currentInput]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }, [flush]);

  const updateFields = (patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    markDirty();
  };

  // Load the saved body once. React never renders children into the
  // contentEditable, so it can't overwrite what's being typed; a
  // ResizeObserver keeps the one-page warning right as the body's height
  // changes (e.g. when the ref/date line is toggled).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.innerHTML = sanitizeLetterHtml(initialBodyRef.current);
    bodyHtmlRef.current = el.innerHTML;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ctrl+S saves immediately; closing the tab with unsaved changes asks
  // first; leaving for another dashboard page sends any pending save.
  useEffect(() => {
    mountedRef.current = true;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirtyRef.current) void flush();
    };
  }, [flush]);

  // Light up the formatting buttons that apply where the caret is.
  useEffect(() => {
    const onSelectionChange = () => {
      const el = bodyRef.current;
      const anchor = document.getSelection()?.anchorNode ?? null;
      if (!el || !anchor || !el.contains(anchor)) return;
      const next = FORMAT_COMMANDS.filter((cmd) => document.queryCommandState(cmd));
      setActive((prev) => (prev.join() === next.join() ? prev : next));
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const onBodyInput = () => {
    const el = bodyRef.current;
    if (!el) return;
    bodyHtmlRef.current = el.innerHTML;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    markDirty();
  };

  // Paste and drop as plain text, so text copied from Word/WhatsApp/a web
  // page can't drag its own fonts, colours or images onto the letterhead.
  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.dataTransfer.getData("text/plain");
    if (!text) return;
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand("insertText", false, text);
  };

  const applyFormat = (cmd: string) => {
    const el = bodyRef.current;
    if (!el) return;
    if (!el.contains(document.getSelection()?.anchorNode ?? null)) el.focus();
    // Semantic <b>/<i>/<u> tags rather than inline styles — the sanitiser
    // keeps tags, not styling.
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(cmd); // fires the editor's input event → autosave
  };

  const duplicate = async () => {
    setDuplicating(true);
    await flush();
    const input = currentInput();
    const copyTitle = input.title ? `${input.title.slice(0, 190)} (copy)` : "";
    let result: Awaited<ReturnType<typeof saveLetter>>;
    try {
      result = await saveLetter(null, { ...input, title: copyTitle, letter_date: today });
    } catch {
      result = { error: "Couldn't reach the server — check your connection." };
    }
    if ("error" in result) {
      setError(result.error);
      setDuplicating(false);
      return;
    }
    router.push(`/dashboard/letterhead/${result.id}`);
  };

  const remove = async () => {
    // Nothing left to save once it's gone.
    window.clearTimeout(timerRef.current);
    dirtyRef.current = false;
    return deleteLetter(idRef.current!);
  };

  return (
    <>
      <Link
        href="/dashboard/letterhead"
        className="print:hidden group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        All letters
      </Link>

      <Card className="print:hidden p-4 md:p-5 mb-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex-1 min-w-[14rem]">
            <label htmlFor="letter-title" className={labelClasses}>
              Title <span className="font-normal text-ink-subtle">— for your list only, doesn&apos;t print</span>
            </label>
            <input
              id="letter-title"
              value={title}
              maxLength={200}
              placeholder="e.g. Experience letter — Ali Raza"
              onChange={(e) => {
                setTitle(e.target.value);
                updateFields({ title: e.target.value });
              }}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="letter-date" className={labelClasses}>
              Date
            </label>
            <input
              id="letter-date"
              type="date"
              required
              value={date}
              onChange={(e) => {
                if (!e.target.value) return;
                setDate(e.target.value);
                updateFields({ date: e.target.value });
              }}
              className={inputClasses}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-small py-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={(e) => {
                setShowMeta(e.target.checked);
                updateFields({ showMeta: e.target.checked });
              }}
              className="size-4 accent-citrus cursor-pointer"
            />
            Print ref &amp; date on the letter
          </label>
        </div>
      </Card>

      {/* Stays in reach while scrolling down a long letter — from tablet
          width up; on a phone it wraps too tall to pin over the page. */}
      <Card className="print:hidden md:sticky md:top-14 lg:top-0 z-20 px-3 py-2.5 mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center">
            {FORMAT_GROUPS.map((group, i) => (
              <div key={i} className={cn("flex items-center gap-0.5", i > 0 && "ml-1.5 pl-1.5 border-l border-ink/10")}>
                {group.map(({ cmd, label, icon: Icon }) => (
                  <button
                    key={cmd}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={active.includes(cmd)}
                    // Keep the caret/selection in the letter while clicking.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyFormat(cmd)}
                    className={cn(
                      "inline-flex items-center justify-center size-9 rounded-lg transition-colors cursor-pointer",
                      active.includes(cmd) ? "bg-ink text-cloud" : "text-ink-muted hover:bg-ink/5 hover:text-ink"
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </button>
                ))}
              </div>
            ))}
          </div>

          <SaveStatus status={status} onRetry={() => void flush()} />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {id && (
              <button type="button" onClick={duplicate} disabled={duplicating} className={buttonStyles.secondary}>
                {duplicating ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                Duplicate
              </button>
            )}
            {id && <DeleteButton action={remove} />}
            <button type="button" onClick={() => window.print()} className={buttonStyles.primary}>
              <Printer className="size-4" aria-hidden />
              Print
            </button>
          </div>
        </div>

        {(error || overflowing) && (
          <div className="flex flex-wrap gap-2 mt-2.5">
            {error && (
              <p className="flex items-center gap-2 text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-1.5">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            {overflowing && (
              <p className="flex items-center gap-2 text-small text-amber-800 bg-amber-500/10 border border-amber-600/20 rounded-lg px-3 py-1.5">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                Text is longer than one page — the extra lines won&apos;t print.
              </p>
            )}
          </div>
        )}
      </Card>

      <LetterheadSheet>
        <div
          className="absolute flex flex-col"
          style={{
            left: "20mm",
            right: "20mm",
            top: "48mm",
            bottom: "29mm",
            fontSize: "10.5pt",
            lineHeight: 1.6,
            color: LETTER_INK,
          }}
        >
          {showMeta && (
            <div className="flex justify-between gap-6 mb-[5mm]">
              <p>
                {refNo ? (
                  <>
                    <span className="font-semibold">Ref:</span> {refNo}
                  </>
                ) : (
                  <span className="print:hidden text-ink-subtle">Ref: given when the letter saves</span>
                )}
              </p>
              <p>
                <span className="font-semibold">Date:</span> {formatLetterDate(date)}
              </p>
            </div>
          )}
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            role="textbox"
            aria-multiline
            aria-label="Letter"
            onInput={onBodyInput}
            onPaste={onPaste}
            onDrop={onDrop}
            data-placeholder="Type or paste your letter here…"
            className="letterhead-body flex-1 min-h-0 overflow-hidden whitespace-pre-wrap break-words rounded-sm outline-1 outline-dashed outline-transparent hover:outline-ink/15 focus:outline-ink/25"
          />
        </div>
      </LetterheadSheet>
    </>
  );
}

function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  const base = "inline-flex items-center gap-1.5 text-small whitespace-nowrap";
  switch (status) {
    case "new":
      return <span className={cn(base, "text-ink-subtle")}>Saves as you type</span>;
    case "dirty":
      return <span className={cn(base, "text-ink-subtle")}>Unsaved changes…</span>;
    case "saving":
      return (
        <span className={cn(base, "text-ink-muted")}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Saving…
        </span>
      );
    case "saved":
      return (
        <span className={cn(base, "text-ink-muted")}>
          <Check className="size-3.5 text-forest" aria-hidden />
          Saved
        </span>
      );
    case "error":
      return (
        <button type="button" onClick={onRetry} className={cn(base, "text-red-700 underline underline-offset-2 cursor-pointer")}>
          Not saved — retry
        </button>
      );
  }
}
