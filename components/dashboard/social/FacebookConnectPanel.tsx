"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { connectFacebook, refreshFacebookPages, saveMappings } from "@/lib/dashboard/actions/social";
import { inputClasses, buttonStyles, Field } from "@/components/dashboard/ui";
import type { ProjectOption } from "@/lib/dashboard/types";
import type { DiscoveredPage } from "@/lib/social-fb";

export default function FacebookConnectPanel({
  projects,
  connectedAt,
  tokenExpiresAt,
}: {
  projects: ProjectOption[];
  connectedAt: string | null;
  tokenExpiresAt: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<DiscoveredPage[] | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const onConnect = (formData: FormData) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await connectFacebook(formData);
      if (result?.error) setError(result.error);
      else if (result?.pages) setPages(result.pages);
    });
  };

  const onRefresh = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await refreshFacebookPages();
      if (result?.error) setError(result.error);
      else if (result?.pages) setPages(result.pages);
    });
  };

  const onSaveMapping = () => {
    if (!pages) return;
    const chosen = pages
      .filter((p) => mapping[p.page_id])
      .map((p) => ({ project_id: mapping[p.page_id], page: p }));
    if (chosen.length === 0) {
      setError("Map at least one Page to a project first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveMappings(JSON.stringify(chosen));
      if (result?.error) setError(result.error);
      else {
        setSaved(true);
        setPages(null);
        setMapping({});
      }
    });
  };

  return (
    <div className="space-y-5">
      {connectedAt ? (
        <p className="text-small text-ink-muted">
          Connected {new Date(connectedAt).toLocaleDateString()}
          {tokenExpiresAt && ` — token valid until ${new Date(tokenExpiresAt).toLocaleDateString()}`}.
        </p>
      ) : (
        <p className="text-small text-ink-muted">Not connected yet.</p>
      )}

      {!pages && (
        <div className="flex flex-wrap items-end gap-3">
          <form action={onConnect} className="flex-1 min-w-64">
            <Field
              label="User Access Token"
              htmlFor="fb-token"
              hint="From Graph API Explorer, with pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish."
            >
              <input id="fb-token" name="token" className={inputClasses} placeholder="EAAG..." />
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

      {pages && (
        <div className="space-y-4">
          <p className="text-small font-medium">Map each Page to a project:</p>
          {pages.map((p) => (
            <div key={p.page_id} className="flex flex-wrap items-center gap-3 border-b border-ink/10 pb-3">
              <div className="min-w-48">
                <p className="text-small font-medium">{p.name}</p>
                <p className="text-tag text-ink-subtle">
                  {p.instagram_business_account_id ? "Facebook + Instagram linked" : "Facebook only"}
                </p>
              </div>
              <select
                className={`${inputClasses} max-w-64`}
                value={mapping[p.page_id] ?? ""}
                onChange={(e) => setMapping((prev) => ({ ...prev, [p.page_id]: e.target.value }))}
              >
                <option value="">Don&apos;t import</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.label}
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
            <button type="button" onClick={() => setPages(null)} className={buttonStyles.secondary}>
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
