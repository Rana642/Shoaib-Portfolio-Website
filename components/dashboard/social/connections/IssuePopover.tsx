"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** A small warning sign whose details open above it on hover, focus or click
 *  (click keeps them open — phones have no hover). */
export default function IssuePopover({ tone, children }: { tone: "error" | "warning"; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [pinned]);

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        aria-expanded={open}
        aria-label={tone === "error" ? "Why this login stopped" : "About the held posts"}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-full transition-colors cursor-pointer",
          tone === "error" ? "text-red-600 hover:bg-red-500/10" : "text-ink/70 hover:bg-citrus/20"
        )}
      >
        <TriangleAlert className="size-4" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute bottom-full left-1/2 z-50 mb-2 w-80 max-w-[80vw] -translate-x-1/2 rounded-xl border bg-white px-4 py-3 text-small text-ink shadow-xl",
            tone === "error" ? "border-red-600/25" : "border-citrus/50"
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
