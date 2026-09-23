import { buttonStyles } from "@/components/dashboard/ui";
import type { ProjectOption } from "@/lib/dashboard/types";

/** Entry point for the Marketing API's "Facebook Login for Business" flow
 *  (separate from the Facebook/Instagram posting connection above — this
 *  one runs against the "ABS Marketing" app, requesting
 *  ads_management/ads_read/business_management, not posting scopes).
 *  Doesn't track connection state in a table yet — the callback just shows
 *  a plain success page listing the discovered ad accounts, so every
 *  project always shows a "Connect" link here rather than an already-connected state. */
export default function MetaAdsConnectPanel({ projects }: { projects: ProjectOption[] }) {
  if (projects.length === 0) {
    return <p className="text-small text-ink-muted">No projects yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-small text-ink-muted mb-2">
        Connects a client&apos;s Meta ad account for campaign management via the Marketing API.
      </p>
      <div className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <a key={p.id} href={`/api/dashboard/ads/facebook-login/authorize?project_id=${p.id}`} className={buttonStyles.secondary}>
            Connect {p.label}
          </a>
        ))}
      </div>
    </div>
  );
}
