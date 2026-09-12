"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeAccount } from "@/lib/dashboard/actions/social";
import { Card, EmptyState } from "@/components/dashboard/ui";
import type { ProjectOption, ClientSocialAccount } from "@/lib/dashboard/types";

export default function AccountsList({
  projects,
  accounts,
}: {
  projects: ProjectOption[];
  accounts: ClientSocialAccount[];
}) {
  const [, startTransition] = useTransition();
  const projectLabel = (id: string) => projects.find((p) => p.id === id)?.label ?? "Unknown project";

  if (accounts.length === 0) {
    return <EmptyState title="No accounts connected yet" description="Connect Facebook above, or add one manually." />;
  }

  const byProject = new Map<string, ClientSocialAccount[]>();
  for (const a of accounts) {
    byProject.set(a.project_id, [...(byProject.get(a.project_id) ?? []), a]);
  }

  return (
    <div className="space-y-4">
      {[...byProject.entries()].map(([projectId, rows]) => (
        <Card key={projectId} className="p-5">
          <p className="font-medium mb-3">{projectLabel(projectId)}</p>
          <div className="space-y-2">
            {rows.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-small">
                <span>
                  <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle mr-2">
                    {a.platform}
                  </span>
                  {a.label}
                </span>
                <button
                  type="button"
                  onClick={() => startTransition(() => removeAccount(a.id))}
                  aria-label={`Remove ${a.label}`}
                  className="text-ink-subtle hover:text-red-700 transition-colors p-1"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
