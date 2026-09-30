import { db } from "@/lib/dashboard/db";
import { listProjectOptions, listClientsMissingProject } from "@/lib/dashboard/projects";
import { PageHeader } from "@/components/dashboard/ui";
import ConnectionsHub, { type HubAccount } from "@/components/dashboard/social/connections/ConnectionsHub";
import { getTikTokAccountSummary } from "@/lib/social-tiktok";
import type { ClientSocialAccount } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections" };

export default async function SocialConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; fb?: string }>;
}) {
  const params = await searchParams;
  const [projects, clientsMissingProject, { data: accounts }, { data: connection }] = await Promise.all([
    listProjectOptions(),
    listClientsMissingProject(),
    db.from("client_social_accounts").select("*").order("created_at"),
    db.from("social_connections").select("connected_at, fb_token_expires_at, li_connected_at").eq("id", 1).maybeSingle(),
  ]);
  const { data: gbp } = await db.from("gbp_connections").select("project_id, locations, selected_location");

  const allAccounts = (accounts ?? []) as ClientSocialAccount[];
  const tiktokAccounts = allAccounts.filter((a) => a.platform === "tiktok");
  const tiktokFollowers = Object.fromEntries(
    await Promise.all(
      tiktokAccounts.map(async (a) => {
        const summary = await getTikTokAccountSummary(a);
        return [a.id, summary.ok ? summary.follower_count : null] as const;
      })
    )
  );

  const fbExpiresAt = connection?.fb_token_expires_at ?? null;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const fbExpiresSoon = fbExpiresAt ? new Date(fbExpiresAt).getTime() - Date.now() < 14 * 86_400_000 : false;

  // Never ship encrypted tokens to the browser — the hub only needs identity.
  const hubAccounts: HubAccount[] = allAccounts.map(({ id, project_id, platform, label, external_id }) => ({
    id,
    project_id,
    platform,
    label,
    external_id,
  }));
  // Google Business lives in gbp_connections, not client_social_accounts —
  // shown on the hub as one row per project with its chosen location.
  for (const g of (gbp ?? []) as { project_id: string; locations: { name: string; title: string }[]; selected_location: string | null }[]) {
    const loc = g.locations.find((l) => l.name === g.selected_location);
    hubAccounts.push({
      id: `gbp-${g.project_id}`,
      project_id: g.project_id,
      platform: "google_business",
      label: loc?.title ?? "Location not chosen yet",
      external_id: g.selected_location ?? "",
    });
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="Link each client project to its social and ad platforms. Workspace logins discover accounts once; projects pick what they use."
      />
      <ConnectionsHub
        projects={projects}
        accounts={hubAccounts}
        tiktokFollowers={tiktokFollowers}
        facebookLogin={{
          provider: "facebook",
          connectedAt: connection?.connected_at ?? null,
          expiresAt: fbExpiresAt,
          expiresSoon: fbExpiresSoon,
        }}
        linkedinLogin={{
          provider: "linkedin",
          connectedAt: connection?.li_connected_at ?? null,
          expiresAt: null,
          // Community Management API access is still under LinkedIn review.
          pendingApproval: !connection?.li_connected_at,
        }}
        clientsMissingProject={clientsMissingProject.map((c) => c.name)}
        initialProjectId={params.project ?? null}
        autoImportFacebook={params.fb === "connected"}
      />
    </>
  );
}
