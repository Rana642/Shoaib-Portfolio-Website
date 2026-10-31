"use client";

import { useMemo, useState, useTransition } from "react";
import { LoaderCircle, Search, TriangleAlert, X } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/dashboard/types";

/** A login an item can come through (Facebook: one of the two stored logins).
 *  `warning`: what's wrong with taking it through this login (missing permissions). */
export type ImportLogin = { id: string; label: string; warning?: string };

export type ImportItem = {
  id: string;
  name: string;
  subtitle?: string;
  /** Project label this item is already imported into, if any. */
  importedTo?: string;
  /** Already imported but still selectable, pinned to this project: something
   *  of it is missing there (a Page's Instagram linked later), or its login can
   *  be changed. */
  addTo?: string;
  addNote?: string;
  /** Every login that reaches it (Facebook Pages). Two = pick one. */
  logins?: ImportLogin[];
  /** Imported: the login its stored token came from now. */
  bound?: { id: string | null; label: string | null; warning?: string };
};

/** What the dialog returns per selected item: the project, and the login when the item has any. */
export type ImportChoice = { project: string; login?: string };

/** The login to pre-select: the current one when it has nothing wrong, else one without a warning. */
const defaultLogin = (item: ImportItem) => {
  if (!item.logins?.length) return undefined;
  if (item.bound?.id && !item.bound.warning && item.logins.some((l) => l.id === item.bound!.id)) return item.bound.id;
  return (item.logins.find((l) => !l.warning) ?? item.logins[0]).id;
};

/** Generic "discovered accounts → projects" import dialog, shared by the
 *  Facebook (Pages + linked Instagram) and LinkedIn (Company Pages) flows.
 *  Already-imported items are shown but locked, so re-importing can't
 *  create duplicate client_social_accounts rows — unless something of them
 *  is still missing or their login can be changed (`addTo`), and then only
 *  that is done. Facebook Pages show which login(s) reach them ("via …"),
 *  with a filter per login and a login choice when two reach the same Page. */
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
  onSave: (mapping: Record<string, ImportChoice>) => Promise<{ error?: string } | undefined>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loginFilter, setLoginFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Record<string, ImportChoice>>({});

  // The logins seen across all items, for the filter (only shown when there are two or more).
  const allLogins = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) for (const l of i.logins ?? []) seen.set(l.id, l.label);
    return [...seen].map(([id, label]) => ({ id, label }));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    if (loginFilter !== "all") list = list.filter((i) => i.logins?.some((l) => l.id === loginFilter));
    const locked = (i: ImportItem) => Number(Boolean(i.importedTo) && !i.addTo);
    return [...list].sort((a, b) => locked(a) - locked(b));
  }, [items, query, loginFilter]);

  const toggle = (item: ImportItem) =>
    setSelected((prev) => {
      const next = { ...prev };
      const id = item.id;
      if (next[id] !== undefined) delete next[id];
      else next[id] = { project: item.addTo ?? defaultProjectId ?? projects[0]?.id ?? "", login: defaultLogin(item) };
      return next;
    });

  const count = Object.keys(selected).length;

  const save = () => {
    const mapping = Object.fromEntries(Object.entries(selected).filter(([, c]) => c.project));
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

        <div className="px-6 py-3 border-b border-ink/10 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-ink/15 px-3">
            <Search className="size-4 text-ink-subtle" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${items.length} accounts…`}
              className="w-full py-2.5 text-small bg-transparent focus:outline-none"
            />
          </div>
          {allLogins.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by login">
              {[{ id: "all", label: "All logins" }, ...allLogins].map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={loginFilter === l.id}
                  onClick={() => setLoginFilter(l.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-tag font-medium transition-colors",
                    loginFilter === l.id ? "border-ink bg-ink text-cloud" : "border-ink/15 text-ink-muted hover:border-ink/30"
                  )}
                >
                  {l.id === "all" ? l.label : `via ${l.label}`}
                </button>
              ))}
            </div>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-2">
          {visible.map((item) => {
            const locked = Boolean(item.importedTo) && !item.addTo;
            const choice = selected[item.id];
            const checked = choice !== undefined;
            const chosenLogin = item.logins?.find((l) => l.id === choice?.login);
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
                    onChange={() => toggle(item)}
                    className="size-4 accent-ink"
                  />
                  <span className="flex items-center justify-center size-9 rounded-full bg-ink/5 text-small font-semibold shrink-0">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-small font-medium truncate">{item.name}</span>
                    <span className="block text-tag text-ink-subtle truncate">
                      {item.importedTo
                        ? `Imported · ${item.importedTo} · ${item.addNote ?? item.subtitle}`
                        : item.subtitle}
                    </span>
                    <LoginLine item={item} />
                  </span>
                </label>
                {checked && (
                  <div className="flex flex-wrap items-center gap-2">
                    {item.logins && item.logins.length > 1 && (
                      <select
                        value={choice.login}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: { ...prev[item.id], login: e.target.value } }))}
                        aria-label={`Login for ${item.name}`}
                        className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-small max-w-56 focus:outline-none focus:border-citrus"
                      >
                        {item.logins.map((l) => (
                          <option key={l.id} value={l.id}>
                            via {l.label}
                            {l.warning ? " ⚠" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {!item.addTo && (
                      <select
                        value={choice.project}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [item.id]: { ...prev[item.id], project: e.target.value } }))}
                        aria-label={`Project for ${item.name}`}
                        className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-small max-w-64 focus:outline-none focus:border-citrus"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {chosenLogin?.warning && (
                      <p className="basis-full text-tag text-red-700 flex items-center gap-1">
                        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                        {chosenLogin.warning}
                      </p>
                    )}
                  </div>
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

/** "via Shoaib Nabi Noor · Ajaz Hussain" — and, once imported, which login holds it now. */
function LoginLine({ item }: { item: ImportItem }) {
  if (!item.logins?.length && !item.bound) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {item.bound && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            item.bound.warning ? "border-red-600/30 bg-red-500/10 text-red-700" : "border-forest/30 bg-forest/10 text-ink"
          )}
          title={item.bound.warning}
        >
          {item.bound.warning && <TriangleAlert className="size-3" aria-hidden />}
          now via {item.bound.label ?? "an unknown login"}
        </span>
      )}
      {(item.logins ?? []).map((l) => (
        <span
          key={l.id}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            l.warning ? "border-citrus/50 text-ink" : "border-ink/15 text-ink-muted"
          )}
          title={l.warning}
        >
          {l.warning && <TriangleAlert className="size-3 text-red-600" aria-hidden />}
          via {l.label}
        </span>
      ))}
    </span>
  );
}
