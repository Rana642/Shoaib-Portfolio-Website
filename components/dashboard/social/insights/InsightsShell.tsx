"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { inputClasses } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "@/lib/dashboard/types";
import { INSIGHT_RANGES } from "@/lib/social-insights-shared";

/** The one filter row (date range first, then project) that scopes every
 *  tile, chart and table below it. While a new range/project loads, the
 *  current numbers stay on screen dimmed rather than flashing empty. */
export default function InsightsShell({
  projects,
  projectId,
  range,
  children,
}: {
  projects: ProjectOption[];
  projectId: string;
  range: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (project: string, r: number) =>
    startTransition(() => router.push(`/dashboard/social/insights?project=${project}&range=${r}`));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div role="group" aria-label="Date range" className="flex items-center gap-1 rounded-lg border border-ink/15 p-1">
          {INSIGHT_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => go(projectId, r)}
              className={cn(
                "px-3 py-1.5 rounded-md text-small font-medium transition-colors cursor-pointer",
                range === r ? "bg-citrus text-ink" : "text-ink-muted hover:text-ink"
              )}
            >
              Last {r} days
            </button>
          ))}
        </div>
        <select
          aria-label="Project"
          className={`${inputClasses} max-w-72`}
          value={projectId}
          onChange={(e) => go(e.target.value, range)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {pending && <LoaderCircle className="size-4 animate-spin text-ink-subtle" aria-label="Loading" />}
      </div>
      <div className={cn("transition-opacity", pending && "opacity-60")}>{children}</div>
    </>
  );
}
