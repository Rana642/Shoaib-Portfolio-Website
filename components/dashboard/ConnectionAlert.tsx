"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";
import type { BrokenConnection } from "@/lib/connection-health";

/** Dismissed for this browser session; it comes back next session while still broken. */
const DISMISSED_KEY = "connection-alert-dismissed";

/**
 * Pop-up on any dashboard page when a connection is broken (Shoaib,
 * 2026-10-31) — once per browser session: "Later" hides it until the next
 * session, "Open Integrations" goes to the fix. Replaces the old red banner
 * on Overview and the Planner; the red badge on Socially Snap → Settings stays
 * while anything is broken. List: lib/connection-health.ts.
 */
export default function ConnectionAlert() {
  const [items, setItems] = useState<BrokenConnection[]>([]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setItems([]);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* blocked storage — still show it */
    }
    fetch("/api/dashboard/connection-health", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { items?: BrokenConnection[] } | null) => {
        if (j?.items?.length) setItems(j.items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, dismiss]);

  if (!items.length) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4 print:hidden" onClick={dismiss}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="connection-alert-title"
        className="w-full max-w-lg rounded-2xl border border-red-600/20 bg-cloud p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-700">
            <TriangleAlert className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="connection-alert-title" className="font-semibold text-ink">
              {items.length === 1 ? "A connection needs fixing" : `${items.length} connections need fixing`}
            </h2>
            <p className="text-small text-ink-muted mt-1">Posts on these accounts can&apos;t go out until they&apos;re reconnected.</p>
          </div>
        </div>
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border border-red-600/20 bg-red-500/5 px-4 py-3">
              <p className="text-small font-semibold text-red-700">{item.title}</p>
              <p className="text-small text-ink-muted mt-1">{item.detail}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={dismiss} className={buttonStyles.secondary}>
            Later
          </button>
          <Link href="/dashboard/social" onClick={dismiss} className={buttonStyles.primary}>
            Open Integrations
          </Link>
        </div>
      </div>
    </div>
  );
}
