"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveProject } from "@/lib/portal/active-project-actions";

/** One business switch for the whole portal, under the logo: every page then shows that business. */
export default function ProjectSwitcher({ projects, activeId }: { projects: { id: string; name: string }[]; activeId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (projects.length < 2) return null;
  return (
    <div>
      <label className="block font-mono uppercase text-[10px] tracking-widest text-cloud/40 mb-1" htmlFor="portal-project">
        Business
      </label>
      <select
        id="portal-project"
        value={activeId}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(null);
            const r = await setActiveProject(e.target.value);
            if ("error" in r) return setError(r.error);
            router.refresh();
          })
        }
        className="w-full rounded-lg border border-cloud/15 bg-cloud/10 px-3 py-2 text-small font-medium text-cloud cursor-pointer disabled:opacity-60"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id} className="text-ink">
            {p.name}
          </option>
        ))}
      </select>
      {error && <p className="text-tag text-red-300 mt-1">{error}</p>}
    </div>
  );
}
