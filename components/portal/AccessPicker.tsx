"use client";

import { featureLabel, PORTAL_FEATURES, type PortalFeature } from "@/lib/portal/features";
import { labelClasses } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

export type MemberAccess = { permissions: string[]; projectIds: string[] | null };

/** Ticks for what a team member can do (only from `features`) and which
 *  projects they see (null = all). Used by the Owner in the portal and by
 *  Shoaib in the dashboard. */
export default function AccessPicker({
  idPrefix,
  features,
  projects,
  value,
  onChange,
}: {
  idPrefix: string;
  features: PortalFeature[];
  projects: { id: string; name: string }[];
  value: MemberAccess;
  onChange: (value: MemberAccess) => void;
}) {
  const toggleFeature = (f: string) =>
    onChange({
      ...value,
      permissions: value.permissions.includes(f) ? value.permissions.filter((p) => p !== f) : [...value.permissions, f],
    });
  const toggleProject = (id: string) => {
    const current = value.projectIds ?? [];
    const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id];
    onChange({ ...value, projectIds: next.length ? next : null });
  };
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-small transition-colors cursor-pointer",
      on ? "border-ink bg-ink text-cloud" : "border-ink/20 text-ink-muted hover:text-ink hover:border-ink/40"
    );

  return (
    <div className="space-y-4">
      {projects.length > 0 && (
        <div>
          <p className={labelClasses}>Projects</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange({ ...value, projectIds: null })} aria-pressed={value.projectIds === null} className={chip(value.projectIds === null)}>
              All projects
            </button>
            {projects.map((p) => {
              const on = value.projectIds?.includes(p.id) ?? false;
              return (
                <button key={p.id} type="button" onClick={() => toggleProject(p.id)} aria-pressed={on} className={chip(on)}>
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <p className={labelClasses}>What they can do</p>
        {features.length === 0 ? (
          <p className="text-small text-ink-muted">Nothing is switched on that could be shared.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PORTAL_FEATURES.filter((f) => features.includes(f.key)).map((f) => (
              <label key={f.key} htmlFor={`${idPrefix}-${f.key}`} className="flex items-start gap-2.5 rounded-lg border border-ink/10 px-3 py-2 cursor-pointer">
                <input
                  id={`${idPrefix}-${f.key}`}
                  type="checkbox"
                  checked={value.permissions.includes(f.key)}
                  onChange={() => toggleFeature(f.key)}
                  className="size-4 mt-0.5 accent-citrus cursor-pointer"
                />
                <span>
                  <span className="block text-small font-medium">{featureLabel(f.key)}</span>
                  <span className="block text-xs text-ink-subtle">{f.hint}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
