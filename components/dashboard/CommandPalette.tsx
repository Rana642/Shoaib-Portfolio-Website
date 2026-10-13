"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, LoaderCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTIONS } from "@/lib/dashboard/sections";
import { OPEN_COMMAND_EVENT, QUICK_ACTIONS } from "@/lib/dashboard/quick-actions";
import type { SearchHit } from "@/app/api/dashboard/search/route";

type Item = { key: string; group: string; label: string; sub?: string | null; href: string; icon?: React.ComponentType<{ className?: string }> };

const PAGES: Item[] = [
  { key: "page:/dashboard", group: "Go to", label: "Overview", href: "/dashboard" },
  ...SECTIONS.flatMap((s) =>
    s.groups.flatMap((g) => g.items.map((i) => ({ key: `page:${i.href}`, group: "Go to", label: i.label, sub: s.label, href: i.href, icon: i.icon })))
  ),
];
const ACTIONS: Item[] = QUICK_ACTIONS.map((a) => ({ key: `action:${a.href}`, group: "Create", label: a.label, href: a.href, icon: a.icon, sub: a.keywords }));

const matches = (item: Item, q: string) => `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q);

/**
 * Ctrl+K (⌘K on a Mac): jump to any page, create something, or search
 * clients, leads, proposals, quotations, invoices, agreements and services.
 * Arrow keys move, Enter opens, Esc closes.
 */
export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Server results remember which query they answer, so a stale answer never shows.
  const [results, setResults] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const [rawActive, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim();
  const searching = q.length >= 2;
  const hits = useMemo(() => (searching && results.q === q ? results.hits : []), [searching, results, q]);
  const loading = searching && results.q !== q;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Server search, debounced.
  useEffect(() => {
    if (!open || !searching) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let found: SearchHit[] = [];
      try {
        const res = await fetch(`/api/dashboard/search?q=${encodeURIComponent(q)}`);
        found = ((await res.json()) as { hits?: SearchHit[] }).hits ?? [];
      } catch {
        /* offline — pages and actions still match */
      }
      if (!cancelled) {
        setResults({ q, hits: found });
        setActive(0);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, searching, open]);

  const items = useMemo<Item[]>(() => {
    const needle = q.toLowerCase();
    if (!needle) return [...ACTIONS, ...PAGES];
    const found: Item[] = hits.map((h, i) => ({ key: `hit:${i}:${h.href}`, group: h.type, label: h.label, sub: h.sub, href: h.href }));
    return [...found, ...ACTIONS.filter((a) => matches(a, needle)), ...PAGES.filter((p) => matches(p, needle))];
  }, [q, hits]);
  const active = Math.min(rawActive, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] print:hidden" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and go"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-ink/10 px-4">
          {loading ? <LoaderCircle className="size-5 shrink-0 animate-spin text-ink-muted" aria-hidden /> : <Search className="size-5 shrink-0 text-ink-muted" aria-hidden />}
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search clients, invoices, leads… or type a page"
            aria-label="Search"
            aria-controls="command-results"
            aria-activedescendant={items[active] ? `command-${active}` : undefined}
            className="h-14 w-full bg-transparent text-body outline-none placeholder:text-ink-subtle"
          />
          <kbd className="hidden sm:inline-block rounded border border-ink/15 px-1.5 py-0.5 font-mono text-tag text-ink-subtle">Esc</kbd>
        </div>

        <ul id="command-results" ref={listRef} role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-small text-ink-muted">{loading ? "Searching…" : "Nothing found."}</li>
          )}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <li key={item.key} role="presentation">
                {header && <p className="px-3 pb-1 pt-3 font-mono uppercase text-tag tracking-widest text-ink-subtle">{header}</p>}
                <button
                  type="button"
                  id={`command-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-small cursor-pointer",
                    i === active ? "bg-ink text-cloud" : "text-ink hover:bg-ink/5"
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0 opacity-70" /> : <ArrowRight className="size-4 shrink-0 opacity-50" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{item.label}</span>
                    {item.sub && item.group !== "Create" && (
                      <span className={cn("ml-2", i === active ? "text-cloud/60" : "text-ink-subtle")}>{item.sub}</span>
                    )}
                  </span>
                  {i === active && <CornerDownLeft className="size-4 shrink-0 opacity-60" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-4 border-t border-ink/10 px-4 py-2.5 text-tag text-ink-subtle">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span className="ml-auto">Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
