"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = { id: string; label: string; meta?: string };

/** Searchable single-select dropdown — generic so the Planner, Insights, and
 *  a future multi-tenant workspace switcher can all reuse it. Labels shaped
 *  "Client — Project" render as a bold project line over a muted client line. */
export default function ProjectCombobox({
  options,
  value,
  onChange,
  placeholder = "Select a project",
  className,
}: {
  options: ComboOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selected = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    inputRef.current?.focus();
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      choose(filtered[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 rounded-xl bg-white border border-ink/15 px-4 py-3 text-left hover:border-ink/30 focus:outline-none focus:border-citrus focus:ring-2 focus:ring-citrus/25 transition-all"
      >
        {selected ? <OptionLabel label={selected.label} /> : <span className="text-ink-subtle">{placeholder}</span>}
        <ChevronsUpDown className="size-4 text-ink-subtle shrink-0" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full rounded-xl bg-white border border-ink/10 shadow-xl shadow-ink/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 border-b border-ink/10">
            <Search className="size-4 text-ink-subtle" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search projects…"
              className="w-full py-3 text-small bg-transparent focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-4 py-3 text-small text-ink-subtle">No matches</li>}
            {filtered.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.id)}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer",
                  i === active && "bg-citrus/15"
                )}
              >
                <OptionLabel label={o.label} />
                <span className="flex items-center gap-2 shrink-0">
                  {o.meta && <span className="text-tag text-ink-subtle">{o.meta}</span>}
                  {o.id === value && <Check className="size-4 text-ink" aria-hidden />}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionLabel({ label }: { label: string }) {
  const [client, project] = label.includes(" — ") ? label.split(" — ") : [null, label];
  return (
    <span className="min-w-0">
      <span className="block text-small font-medium truncate">{project}</span>
      {client && <span className="block text-tag text-ink-subtle truncate">{client}</span>}
    </span>
  );
}
