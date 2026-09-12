"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { connectLinkedIn, refreshLinkedInOrgs, saveLinkedInMappings } from "@/lib/dashboard/actions/social";
import { inputClasses, buttonStyles, Field } from "@/components/dashboard/ui";
import type { ProjectOption } from "@/lib/dashboard/types";
import type { DiscoveredOrganization } from "@/lib/social-linkedin";

export default function LinkedInConnectPanel({
  projects,
  connectedAt,
}: {
  projects: ProjectOption[];
  connectedAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<DiscoveredOrganization[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const onConnect = (formData: FormData) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await connectLinkedIn(formData);
      if (result?.error) setError(result.error);
      else if (result?.orgs) setOrgs(result.orgs);
    });
  };

  const onRefresh = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await refreshLinkedInOrgs();
      if (result?.error) setError(result.error);
      else if (result?.orgs) setOrgs(result.orgs);
    });
  };

  const onSaveMapping = () => {
    if (!orgs) return;
    const chosen = orgs
      .filter((o) => mapping[o.organization_urn])
      .map((o) => ({ project_id: mapping[o.organization_urn], org: o }));
    if (chosen.length === 0) {
      setError("Map at least one Page to a project first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveLinkedInMappings(JSON.stringify(chosen));
      if (result?.error) setError(result.error);
      else {
        setSaved(true);
        setOrgs(null);
        setMapping({});
      }
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-small text-ink-muted">
        Needs LinkedIn&apos;s Marketing Developer Platform product approved on your app for the
        organization-admin/posting scopes — that&apos;s a manual review on their side, not something that
        just works once an app exists. Use the manual account form below as a fallback until then.
      </p>

      {connectedAt ? (
        <p className="text-small text-ink-muted">Connected {new Date(connectedAt).toLocaleDateString()}.</p>
      ) : (
        <p className="text-small text-ink-muted">Not connected yet.</p>
      )}

      {!orgs && (
        <div className="flex flex-wrap items-end gap-3">
          <form action={onConnect} className="flex-1 min-w-64">
            <Field
              label="Member Access Token"
              htmlFor="li-token"
              hint="From your LinkedIn Developer app's OAuth Token Generator, with r_organization_admin and w_organization_social."
            >
              <input id="li-token" name="token" className={inputClasses} placeholder="AQV..." />
            </Field>
            <button type="submit" disabled={pending} className={`${buttonStyles.primary} mt-3`}>
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Connect
            </button>
          </form>
          {connectedAt && (
            <button type="button" onClick={onRefresh} disabled={pending} className={buttonStyles.secondary}>
              Refresh Pages
            </button>
          )}
        </div>
      )}

      {orgs && (
        <div className="space-y-4">
          <p className="text-small font-medium">Map each Page to a project:</p>
          {orgs.map((o) => (
            <div key={o.organization_urn} className="flex flex-wrap items-center gap-3 border-b border-ink/10 pb-3">
              <p className="text-small font-medium min-w-48">{o.name}</p>
              <select
                className={`${inputClasses} max-w-64`}
                value={mapping[o.organization_urn] ?? ""}
                onChange={(e) => setMapping((prev) => ({ ...prev, [o.organization_urn]: e.target.value }))}
              >
                <option value="">Don&apos;t import</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={onSaveMapping} disabled={pending} className={buttonStyles.primary}>
              {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Save mapping
            </button>
            <button type="button" onClick={() => setOrgs(null)} className={buttonStyles.secondary}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {saved && <p className="text-small text-green-700">Accounts saved.</p>}
      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
    </div>
  );
}
