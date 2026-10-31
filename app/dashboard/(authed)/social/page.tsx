import { db } from "@/lib/dashboard/db";
import { listProjectOptions, listClientsMissingProject } from "@/lib/dashboard/projects";
import { PageHeader } from "@/components/dashboard/ui";
import ConnectionsHub, { type HubAccount } from "@/components/dashboard/social/connections/ConnectionsHub";
import { getTikTokAccountSummary } from "@/lib/social-tiktok";
import { getYouTubeChannelSummary } from "@/lib/social-youtube";
import { facebookAccountOwners, listFacebookLogins } from "@/lib/social-accounts";
import { heldPostsSummary, blockedAccountsLine, type BlockedLogin } from "@/lib/social-connection-hold";
import { loginNames } from "@/lib/connection-health";
import type { ClientSocialAccount } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrations" };

export default async function SocialConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    li?: string;
    li_error?: string;
    li_company?: string;
    li_company_error?: string;
    fb?: string;
    fb_error?: string;
    instagram?: string;
    instagram_error?: string;
    youtube?: string;
    youtube_error?: string;
  }>;
}) {
  const params = await searchParams;
  const [projects, clientsMissingProject, { data: accounts }, { data: connection }, fbLogins] = await Promise.all([
    listProjectOptions(),
    listClientsMissingProject(),
    db.from("client_social_accounts").select("*").order("created_at"),
    db.from("social_connections").select("connected_at, fb_token_expires_at, li_connected_at, li_token_expires_at").eq("id", 1).maybeSingle(),
    listFacebookLogins(),
  ]);
  const [{ data: gbp }, { count: waNumbers }, held] = await Promise.all([
    db.from("gbp_connections").select("project_id, locations, selected_location"),
    db.from("wa_accounts").select("id", { count: "exact", head: true }),
    heldPostsSummary().catch(() => ({ count: 0, error: null, logins: [] as BlockedLogin[] })),
  ]);

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
  const youtubeSubscribers = Object.fromEntries(
    await Promise.all(
      allAccounts
        .filter((a) => a.platform === "youtube")
        .map(async (a) => [a.id, (await getYouTubeChannelSummary(a))?.subscribers ?? null] as const)
    )
  );

  const fbExpiresAt = connection?.fb_token_expires_at ?? null;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const now = Date.now();
  const fbExpiresSoon = fbExpiresAt ? new Date(fbExpiresAt).getTime() - now < 14 * 86_400_000 : false;
  const fb1 = fbLogins.find((l) => l.slot === 1)!;
  const fb2 = fbLogins.find((l) => l.slot === 2)!;
  // A broken login can't tell us its name any more (no permissions left), so
  // loginNames falls back to the profile recorded on the Pages it imported.
  const { 1: fb1Name, 2: fb2Name } = loginNames(fbLogins, allAccounts);

  // Each Facebook login's health: how many Pages it serves, whether Meta says
  // it still works (debug_token), and posts held behind it (lib/social-connection-hold.ts).
  const healthOf = (name: string | null, works: boolean | null, missing: string[]) => {
    const blocked = name ? held.logins.find((l) => l.kind === "facebook" && l.name === name) : undefined;
    return {
      pages: name ? allAccounts.filter((a) => a.platform === "facebook" && a.fb_login_name === name).length : 0,
      broken: works === false,
      blocked: blocked ? { since: blocked.since, posts: blocked.count, accounts: blockedAccountsLine(blocked) } : null,
      missing,
    };
  };
  // Which login each Facebook/Instagram token came from, and what it lacks (debug_token, cached briefly).
  const accountOwners = await facebookAccountOwners(
    fbLogins.map((l) => ({ slot: l.slot, name: l.slot === 1 ? fb1Name : fb2Name, userId: l.userId }))
  ).catch(() => ({}));
  // Instagram Login accounts (and logins whose profile isn't recorded) that are blocked.
  const otherBlocked = held.logins
    .filter((l) => l.kind === "instagram" || (l.name !== fb1Name && l.name !== fb2Name))
    .map((l) => ({ name: l.kind === "instagram" ? `Instagram login ${l.name}` : (l.name ?? "A Facebook profile"), since: l.since, posts: l.count, accounts: blockedAccountsLine(l) }));
  const gbpProjects = new Set(((gbp ?? []) as { project_id: string; selected_location: string | null }[]).filter((g) => g.selected_location).map((g) => g.project_id)).size;

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
        title="Integrations"
        description="Every login and connected account in one place, and whether it's working. Workspace logins discover accounts once; each client project picks what it uses."
      />
      {params.li === "connected" && (
        <div className="rounded-lg border border-green-600/25 bg-green-500/10 text-green-800 px-4 py-3 text-small mb-6">
          LinkedIn profile connected. LinkedIn tokens last 60 days — reconnect it from the LinkedIn tile when it expires.
        </div>
      )}
      {params.li_error && (
        <div className="rounded-lg border border-red-600/25 bg-red-500/10 text-red-800 px-4 py-3 text-small mb-6">{params.li_error}</div>
      )}
      <ConnectionsHub
        projects={projects}
        accounts={hubAccounts}
        tiktokFollowers={tiktokFollowers}
        youtubeSubscribers={youtubeSubscribers}
        facebookLogin={{
          provider: "facebook",
          connectedAt: connection?.connected_at ?? null,
          expiresAt: fbExpiresAt,
          expiresSoon: fbExpiresSoon,
          accountName: fb1Name,
        }}
        facebookLogin2={{
          provider: "facebook",
          connectedAt: fb2.connectedAt,
          expiresAt: fb2.expiresAt,
          expiresSoon: fb2.expiresAt ? new Date(fb2.expiresAt).getTime() - now < 14 * 86_400_000 : false,
          accountName: fb2Name,
        }}
        facebookHealth={healthOf(fb1Name, fb1.works, fb1.missing)}
        facebookHealth2={healthOf(fb2Name, fb2.works, fb2.missing)}
        accountOwners={accountOwners}
        otherBlocked={otherBlocked}
        otherApps={[
          { key: "gbp", title: "Google Business", detail: `${gbpProjects} project${gbpProjects === 1 ? "" : "s"} with a location`, href: "/dashboard/gbp" },
          { key: "whatsapp", title: "WhatsApp numbers", detail: `${waNumbers ?? 0} number${waNumbers === 1 ? "" : "s"} connected`, href: "/dashboard/whatsapp/numbers" },
        ]}
        linkedinLogin={{
          provider: "linkedin",
          connectedAt: connection?.li_connected_at ?? null,
          expiresAt: connection?.li_token_expires_at ?? null,
          expiresSoon: connection?.li_token_expires_at ? new Date(connection.li_token_expires_at).getTime() - now < 14 * 86_400_000 : false,
        }}
        clientsMissingProject={clientsMissingProject.map((c) => c.name)}
        initialProjectId={params.project ?? null}
        autoImportFacebook={params.fb === "connected"}
        autoImportLinkedIn={params.li_company === "connected"}
        notice={
          params.li_company_error
            ? { kind: "error", text: `LinkedIn: ${params.li_company_error.slice(0, 300)}` }
            : params.youtube_error
            ? { kind: "error", text: `YouTube: ${params.youtube_error.slice(0, 300)}` }
            : params.youtube
            ? { kind: "ok", text: `YouTube channel ${params.youtube.slice(0, 80)} connected. Until Google's YouTube API audit is approved, videos posted from here upload as private.` }
            : params.fb_error
            ? { kind: "error", text: `Facebook: ${params.fb_error.slice(0, 300)}` }
            : params.instagram_error
            ? { kind: "error", text: `Instagram: ${params.instagram_error.slice(0, 300)}` }
            : params.instagram
              ? { kind: "ok", text: `Instagram ${params.instagram.slice(0, 60)} connected through Instagram login.` }
              : null
        }
      />
    </>
  );
}
