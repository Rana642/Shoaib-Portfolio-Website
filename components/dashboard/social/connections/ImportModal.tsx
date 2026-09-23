"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/dashboard/types";

export type ImportItem = {
  id: string;
  name: string;
  subtitle?: string;
  /** Project label this item is already imported into, if any. */
  importedTo?: string;
};

/** Generic "discovered accounts → projects" import dialog, shared by the
 *  Facebook (Pages + linked Instagram) and LinkedIn (Company Pages) flows.
 *  Already-imported items are shown but locked, so re-importing can't
 *  create duplicate client_social_accounts rows. */
export default function ImportModal({
  title,
  description,
  items,
  projects,
  defaultProjectId,
  onSave,
  onClose,
}: {
  title: string;
  description: string;
  items: ImportItem[];
  projects: ProjectOption[];
  defaultProjectId: string | null;
  onSave: (mapping: Record<string, string>) => Promise<{ error?: string } | undefined>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    return [...list].sort((a, b) => Number(Boolean(a.importedTo)) - Number(Boolean(b.importedTo)));
  }, [items, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id] !== undefined) delete next[id];
      else next[id] = defaultProjectId ?? projects[0]?.id ?? "";
      return next;
    });

  const count = Object.keys(selected).length;

  const save = () => {
    const mapping = Object.fromEntries(Object.entries(selected).filter(([, p]) => p));
    if (Object.keys(mapping).length === 0) {
      setError("Select at least one account and a project.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onSave(mapping);
      if (result?.error) setError(result.error);
      else onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white border border-ink/10 shadow-2xl shadow-ink/20"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-ink/10">
          <div>
            <p className="text-body-lg font-semibold">{title}</p>
            <p className="text-small text-ink-muted mt-1">{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-ink-subtle hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-ink/10">
          <div className="flex items-center gap-2 rounded-lg border border-ink/15 px-3">
            <Search className="size-4 text-ink-subtle" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${items.length} accounts…`}
              className="w-full py-2.5 text-small bg-transparent focus:outline-none"
            />
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-2">
          {visible.map((item) => {
            const locked = Boolean(item.importedTo);
            const checked = selected[item.id] !== undefined;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-xl px-3 py-3",
                  checked && "bg-citrus/10",
                  locked && "opacity-60"
                )}
              >
                <label className={cn("flex items-center gap-3 flex-1 min-w-52", !locked && "cursor-pointer")}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={checked}
                    onChange={() => toggle(item.id)}
                    className="size-4 accent-ink"
                  />
                  <span className="flex items-center justify-center size-9 rounded-full bg-ink/5 text-small font-semibold shrink-0">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-small font-medium truncate">{item.name}</span>
                    <span className="block text-tag text-ink-subtle truncate">
                      {locked ? `Imported · ${item.importedTo}` : item.subtitle}
                    </span>
                  </span>
                </label>
                {checked && (
                  <select
                    value={selected[item.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-small max-w-64 focus:outline-none focus:border-citrus"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink/10">
          {error ? <p className="text-small text-red-700">{error}</p> : <p className="text-small text-ink-muted">{count} selected</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonStyles.secondary}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending || count === 0} className={buttonStyles.primary}>
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Import {count > 0 ? count : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
