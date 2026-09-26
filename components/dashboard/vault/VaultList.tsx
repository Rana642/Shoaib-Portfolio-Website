"use client";

import { useState } from "react";
import { BellRing, ChevronDown, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { Card } from "@/components/dashboard/ui";
import { ISSUE_LABELS, accountLabel, getPlatform, securityIssues } from "@/lib/vault-platforms";
import { cn } from "@/lib/utils";
import { PlatformIcon, iconButton, type Item, type VaultClient, type VaultProject } from "./shared";

type Section = { key: string; title: string | null; items: Item[] };
type Group = {
  key: string;
  title: string;
  /** For "+ add" and "tell client": the owner this group files under. */
  owner: "own" | string | null;
  sections: Section[];
  count: number;
  attention: number;
  /** Entries whose changed password the client hasn't been told about. */
  untold: Item[];
};

function buildGroups(items: Item[], clients: VaultClient[], projects: VaultProject[]): Group[] {
  const finish = (key: string, title: string, owner: Group["owner"], sections: Section[]): Group => {
    const all = sections.flatMap((s) => s.items);
    return {
      key,
      title,
      owner,
      sections: sections.filter((s) => s.items.length > 0),
      count: all.length,
      attention: all.filter((i) => i.broken || securityIssues(i.secret).length > 0).length,
      untold: all.filter((i) => !i.broken && securityIssues(i.secret).includes("client_not_told")),
    };
  };
  const byTitle = (a: Item, b: Item) => a.secret.title.localeCompare(b.secret.title);
  const groups: Group[] = [];

  const own = items.filter((i) => i.secret.own).sort(byTitle);
  if (own.length) groups.push(finish("own", "Ads by Shoaib — my accounts", "own", [{ key: "own", title: null, items: own }]));

  for (const client of clients) {
    const mine = items.filter((i) => !i.secret.own && i.client_id === client.id);
    if (!mine.length) continue;
    const clientProjects = projects.filter((p) => p.client_id === client.id);
    const sections: Section[] = clientProjects.map((p) => ({
      key: p.id,
      title: p.name,
      items: mine.filter((i) => i.project_id === p.id).sort(byTitle),
    }));
    const loose = mine.filter((i) => !i.project_id || !clientProjects.some((p) => p.id === i.project_id)).sort(byTitle);
    sections.push({ key: `${client.id}-none`, title: sections.some((s) => s.items.length) ? "Client level" : null, items: loose });
    groups.push(finish(client.id, client.name, client.id, sections));
  }

  // Neither own nor filed under a known client (e.g. the client was deleted).
  const known = new Set(clients.map((c) => c.id));
  const unfiled = items.filter((i) => !i.secret.own && (!i.client_id || !known.has(i.client_id))).sort(byTitle);
  if (unfiled.length) groups.push(finish("unfiled", "Not filed under a client", null, [{ key: "unfiled", title: null, items: unfiled }]));

  return groups;
}

export default function VaultList({
  items,
  clients,
  projects,
  search,
  attentionOnly,
  onOpen,
  onAdd,
  onTellClient,
}: {
  items: Item[];
  clients: VaultClient[];
  projects: VaultProject[];
  search: string;
  attentionOnly: boolean;
  onOpen: (item: Item) => void;
  onAdd: (owner: "own" | string) => void;
  onTellClient: (clientId: string, items: Item[]) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "";
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "";
  const q = search.trim().toLowerCase();
  const matches = (i: Item) => {
    if (attentionOnly && !i.broken && securityIssues(i.secret).length === 0) return false;
    if (!q) return true;
    const platform = getPlatform(i.secret.platform);
    const haystack = [
      i.secret.title,
      platform.label,
      clientName(i.client_id),
      projectName(i.project_id),
      i.secret.notes,
      ...platform.fields.filter((f) => f.kind !== "secret").map((f) => i.secret.fields[f.id] ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  };

  const groups = buildGroups(items.filter(matches), clients, projects);
  const filtering = Boolean(q) || attentionOnly;

  if (groups.length === 0) {
    return (
      <Card className="p-10 text-center">
        <ShieldCheck className="size-8 text-ink-subtle mx-auto mb-3" aria-hidden />
        <p className="text-body-lg font-medium">{filtering ? "Nothing matches" : "Your vault is empty"}</p>
        <p className="text-small text-ink-muted mt-1">
          {attentionOnly && !q
            ? "Every account has 2-step, recovery info and a strong password."
            : filtering
              ? "Try a different search."
              : "Add a client's accounts — or your own — to get started."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const open = filtering || !collapsed.has(g.key);
        return (
          <Card key={g.key} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-5 py-3 border-b border-ink/5">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
                aria-expanded={open}
                className="flex items-center gap-2 mr-auto text-left font-medium cursor-pointer"
              >
                <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", !open && "-rotate-90")} aria-hidden />
                {g.title}
                <span className="text-small font-normal text-ink-subtle">
                  {g.count} account{g.count === 1 ? "" : "s"}
                </span>
              </button>
              {g.attention > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {g.attention} need{g.attention === 1 ? "s" : ""} attention
                </span>
              )}
              {g.owner && g.owner !== "own" && g.untold.length > 0 && (
                <button
                  type="button"
                  onClick={() => onTellClient(g.owner!, g.untold)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-citrus/60 bg-citrus/15 px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-citrus/25"
                >
                  <BellRing className="size-3.5" aria-hidden />
                  Tell client about {g.untold.length} password change{g.untold.length === 1 ? "" : "s"}
                </button>
              )}
              {g.owner && (
                <button type="button" onClick={() => onAdd(g.owner!)} title="Add accounts here" aria-label={`Add accounts for ${g.title}`} className={cn(iconButton, "size-8")}>
                  <Plus className="size-4" aria-hidden />
                </button>
              )}
            </div>

            {open &&
              g.sections.map((s) => (
                <div key={s.key}>
                  {s.title && (
                    <p className="px-4 md:px-5 pt-3 pb-1 font-mono uppercase text-tag tracking-widest text-ink-subtle">{s.title}</p>
                  )}
                  <ul className="divide-y divide-ink/5">
                    {s.items.map((i) => (
                      <li key={i.id}>
                        <Row item={i} onOpen={onOpen} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </Card>
        );
      })}
    </div>
  );
}

function Row({ item, onOpen }: { item: Item; onOpen: (item: Item) => void }) {
  if (item.broken) {
    return (
      <div className="flex items-center gap-4 px-4 md:px-5 py-3.5 text-small text-red-700">
        <TriangleAlert className="size-4" aria-hidden />
        This entry couldn&apos;t be decrypted — it was left untouched.
      </div>
    );
  }
  const platform = getPlatform(item.secret.platform);
  const account = accountLabel(item.secret);
  const issues = securityIssues(item.secret);
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="w-full flex items-center gap-4 px-4 md:px-5 py-3.5 text-left hover:bg-ink/[0.02] transition-colors cursor-pointer"
    >
      <span className="flex items-center justify-center size-9 rounded-lg bg-ink/[0.06] shrink-0">
        <PlatformIcon platform={platform.id} className="text-ink-muted" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">{item.secret.title}</span>
        <span className="block text-small text-ink-muted truncate">
          {platform.label}
          {account && ` · ${account}`}
        </span>
      </span>
      {issues.length === 0 ? (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-forest shrink-0">
          <ShieldCheck className="size-3.5" aria-hidden />
          Secure
        </span>
      ) : (
        <span className="hidden sm:flex flex-wrap justify-end gap-1 max-w-[45%]">
          {issues.slice(0, 2).map((i) => (
            <span key={i} className="text-xs rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-800 border border-amber-600/20 whitespace-nowrap">
              {ISSUE_LABELS[i]}
            </span>
          ))}
          {issues.length > 2 && <span className="text-xs text-amber-800">+{issues.length - 2}</span>}
        </span>
      )}
      {issues.length > 0 && <TriangleAlert className="sm:hidden size-4 text-amber-700 shrink-0" aria-label="Needs attention" />}
    </button>
  );
}
