"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { OPEN_COMMAND_EVENT, QUICK_ACTIONS } from "@/lib/dashboard/quick-actions";

const LEADS_SEEN_KEY = "dashboard-leads-seen";

/**
 * "+ New" (a menu of create shortcuts) and "Search" (opens Ctrl+K), under
 * the sidebar logo. On the icon rail they stack and the menu opens to the right.
 */
export function QuickTools({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative mt-5 flex gap-2", rail && "flex-col")}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={rail ? "New" : undefined}
        aria-label={rail ? "New" : undefined}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-citrus py-2 text-small font-medium text-ink transition-colors hover:bg-citrus/90 cursor-pointer"
      >
        <Plus className="size-4" aria-hidden />
        {!rail && "New"}
      </button>
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          window.dispatchEvent(new Event(OPEN_COMMAND_EVENT));
        }}
        title="Search (Ctrl K)"
        aria-label={rail ? "Search" : undefined}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-cloud/15 py-2 text-small text-cloud/70 transition-colors hover:bg-cloud/5 hover:text-cloud cursor-pointer"
      >
        <Search className="size-4" aria-hidden />
        {!rail && "Search"}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-60 rounded-xl border border-ink/10 bg-white p-1.5 shadow-2xl",
            rail ? "left-full top-0 ml-3" : "left-0 top-full mt-2"
          )}
        >
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-small text-ink hover:bg-ink/5"
            >
              <a.icon className="size-4 text-ink-muted" aria-hidden />
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How many things wait in each section (sidebar badges): Sales = leads since
 * the last visit to Leads, Clients = credential submissions to import,
 * Finance = receipts to confirm + late invoices + bills due, Planner =
 * posts to caption or that failed, WhatsApp = chats with unread messages.
 * Refreshed on navigation (at most every 15 s) and every 2 minutes.
 */
export function useAttentionCounts(enabled: boolean): Record<string, number> {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const lastFetch = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onLeads = pathname === "/dashboard/leads";
    try {
      if (onLeads || !localStorage.getItem(LEADS_SEEN_KEY)) localStorage.setItem(LEADS_SEEN_KEY, new Date().toISOString());
    } catch {
      /* blocked storage — leads just show no badge */
    }

    // No "cancelled" guard: a re-run within 15 s skips its own fetch, so the
    // earlier fetch must still be allowed to land (React drops updates after unmount).
    const load = async (force = false) => {
      if (!force && Date.now() - lastFetch.current < 15_000) return;
      lastFetch.current = Date.now();
      try {
        const res = await fetch("/api/dashboard/counts", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { finance: number; whatsapp: number; planner: number; clients: number; integrations?: number; leadTimes: string[] };
        let seen = Date.now();
        try {
          seen = Date.parse(localStorage.getItem(LEADS_SEEN_KEY) ?? "") || seen;
        } catch {
          /* ignore */
        }
        const sales = j.leadTimes.filter((t) => Date.parse(t) > seen).length;
        setCounts({ sales, clients: j.clients, finance: j.finance, planner: j.planner, whatsapp: j.whatsapp, "socially-settings": j.integrations ?? 0 });
      } catch {
        /* offline — keep the last counts */
      }
    };
    load(onLeads);
    const timer = setInterval(() => load(true), 120_000);
    return () => clearInterval(timer);
  }, [enabled, pathname]);

  return counts;
}

/** Badges that mean something is broken (red), not just waiting (citrus). */
export const ALERT_BADGES = new Set(["socially-settings"]);

/** The little count on a sidebar item (a dot on the icon rail). `alert`: red. */
export function CountBadge({ count, rail, active, alert = false }: { count: number | undefined; rail: boolean; active: boolean; alert?: boolean }) {
  if (!count) return null;
  if (rail) {
    return (
      <span
        className={cn("absolute top-1.5 right-2 size-2 rounded-full", alert ? "bg-red-600" : active ? "bg-ink" : "bg-citrus")}
        aria-label={`${count} ${alert ? "broken" : "waiting"}`}
      />
    );
  }
  return (
    <span
      className={cn(
        "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none",
        alert ? "bg-red-600 text-white" : active ? "bg-ink text-cloud" : "bg-citrus text-ink"
      )}
      aria-label={`${count} ${alert ? "broken" : "waiting"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
