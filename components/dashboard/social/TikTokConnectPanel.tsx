import { buttonStyles } from "@/components/dashboard/ui";
import type { ProjectOption, ClientSocialAccount } from "@/lib/dashboard/types";
import type { TikTokAccountSummary } from "@/lib/social-tiktok";

/** Server component — unlike Facebook/LinkedIn there's no client-side
 *  "discover, then map" step. TikTok's Login Kit consent already scopes to
 *  one creator account per authorization, with the project chosen up front
 *  via the "Connect" link's project_id, so this is just links out + a
 *  read-only summary of whatever's already connected. */
export default function TikTokConnectPanel({
  projects,
  accounts,
  summaries,
  vaultConfigured,
}: {
  projects: ProjectOption[];
  accounts: ClientSocialAccount[];
  summaries: Record<string, TikTokAccountSummary>;
  vaultConfigured: boolean;
}) {
  if (!vaultConfigured) {
    return (
      <p className="text-small text-ink-muted">
        Add a &quot;tiktok&quot; credential (client_key/client_secret) to the{" "}
        <a href="/dashboard/api-vault" className="underline hover:text-cobalt">
          API Vault
        </a>{" "}
        first.
      </p>
    );
  }

  const connectedProjectIds = new Set(accounts.map((a) => a.project_id));
  const unconnected = projects.filter((p) => !connectedProjectIds.has(p.id));

  return (
    <div className="space-y-5">
      <p className="text-small text-ink-muted">
        Posts upload as a draft to the creator&apos;s TikTok inbox rather than publishing directly — an
        unaudited app (until App Review approves public posting) can only direct-publish to an account
        that&apos;s also set to Private in its own TikTok settings, which this account isn&apos;t.
      </p>

      {accounts.length > 0 && (
        <div className="space-y-4">
          {accounts.map((a) => {
            const summary = summaries[a.id];
            const project = projects.find((p) => p.id === a.project_id);
            return (
              <div key={a.id} className="border-b border-ink/10 pb-4">
                <p className="text-small font-medium">
                  {project?.label ?? "Unknown project"} — {a.label}
                </p>
                {summary?.ok ? (
                  <>
                    <p className="text-tag text-ink-subtle mt-1">
                      {summary.follower_count.toLocaleString()} followers · {summary.likes_count.toLocaleString()} likes
                    </p>
                    {summary.videos.length > 0 && (
                      <ul className="text-tag text-ink-subtle mt-1 list-disc list-inside">
                        {summary.videos.map((v) => (
                          <li key={v.id}>{v.title || "(untitled)"}</li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-tag text-red-700 mt-1">{summary?.error ?? "Couldn't load stats."}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unconnected.length > 0 && (
        <div>
          <p className="text-small font-medium mb-2">Connect a project:</p>
          <div className="flex flex-wrap gap-2">
            {unconnected.map((p) => (
              <a key={p.id} href={`/api/dashboard/social/tiktok/authorize?project_id=${p.id}`} className={buttonStyles.secondary}>
                Connect {p.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
