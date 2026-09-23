"use client";

import { Check, ChevronRight, Clock, Minus } from "lucide-react";
import { PLATFORMS, type ConnectionStatus, type PlatformKey } from "@/lib/social-platforms";
import type { ProjectOption } from "@/lib/dashboard/types";
import { PlatformChip } from "./platform-ui";

/** Projects × platforms at a glance — click a row to open that project. */
export default function ConnectionsMatrix({
  projects,
  statusOf,
  onOpen,
}: {
  projects: ProjectOption[];
  statusOf: (projectId: string, platform: PlatformKey) => ConnectionStatus;
  onOpen: (projectId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
      <table className="w-full text-small">
        <thead>
          <tr className="border-b border-ink/10">
            <th className="text-left font-medium text-ink-muted px-5 py-4 min-w-56">Project</th>
            {PLATFORMS.map((p) => (
              <th key={p.key} className="px-3 py-4">
                <span className="flex flex-col items-center gap-1.5">
                  <PlatformChip platform={p} size="sm" />
                  <span className="text-tag font-medium text-ink-muted">{p.label}</span>
                </span>
              </th>
            ))}
            <th className="px-5 py-4 text-right font-medium text-ink-muted">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((proj) => {
            const statuses = PLATFORMS.map((p) => statusOf(proj.id, p.key));
            const done = statuses.filter((s) => s === "connected" || s === "workspace").length;
            const [client, name] = proj.label.includes(" — ") ? proj.label.split(" — ") : [null, proj.label];
            return (
              <tr
                key={proj.id}
                onClick={() => onOpen(proj.id)}
                className="group border-b border-ink/5 last:border-0 cursor-pointer hover:bg-citrus/10 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <span className="block font-medium">{name}</span>
                  {client && <span className="block text-tag text-ink-subtle">{client}</span>}
                </td>
                {statuses.map((s, i) => (
                  <td key={PLATFORMS[i].key} className="px-3 py-3.5">
                    <span className="flex justify-center">
                      <Cell status={s} />
                    </span>
                  </td>
                ))}
                <td className="px-5 py-3.5">
                  <span className="flex items-center justify-end gap-3">
                    <span className="w-16 h-1.5 rounded-full bg-ink/10 overflow-hidden">
                      <span className="block h-full bg-forest rounded-full" style={{ width: `${(done / PLATFORMS.length) * 100}%` }} />
                    </span>
                    <span className="text-tag text-ink-muted tabular-nums">
                      {done}/{PLATFORMS.length}
                    </span>
                    <ChevronRight className="size-4 text-ink-subtle group-hover:translate-x-0.5 transition-transform" aria-hidden />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ status }: { status: ConnectionStatus }) {
  if (status === "connected")
    return (
      <span title="Connected" className="flex items-center justify-center size-7 rounded-full bg-forest text-white">
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  if (status === "workspace")
    return (
      <span title="Covered by workspace credential" className="flex items-center justify-center size-7 rounded-full bg-cobalt/15 text-ink">
        <Check className="size-4" aria-hidden />
      </span>
    );
  if (status === "pending")
    return (
      <span title="Awaiting platform approval" className="flex items-center justify-center size-7 rounded-full bg-citrus/25 text-ink">
        <Clock className="size-3.5" aria-hidden />
      </span>
    );
  return (
    <span title="Not connected" className="flex items-center justify-center size-7 rounded-full border border-dashed border-ink/20 text-ink-subtle">
      <Minus className="size-3.5" aria-hidden />
    </span>
  );
}
