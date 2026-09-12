import { db } from "@/lib/dashboard/db";
import { listProjectOptions, listClientsMissingProject } from "@/lib/dashboard/projects";
import { PageHeader, Card } from "@/components/dashboard/ui";
import FacebookConnectPanel from "@/components/dashboard/social/FacebookConnectPanel";
import LinkedInConnectPanel from "@/components/dashboard/social/LinkedInConnectPanel";
import ManualAccountForm from "@/components/dashboard/social/ManualAccountForm";
import AccountsList from "@/components/dashboard/social/AccountsList";
import type { ClientSocialAccount } from "@/lib/dashboard/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Social connections" };

export default async function SocialConnectionsPage() {
  const [projects, clientsMissingProject, { data: accounts }, { data: connection }] = await Promise.all([
    listProjectOptions(),
    listClientsMissingProject(),
    db.from("client_social_accounts").select("*").order("created_at"),
    db.from("social_connections").select("connected_at, fb_token_expires_at, li_connected_at").eq("id", 1).maybeSingle(),
  ]);

  return (
    <>
      <PageHeader
        title="Social connections"
        description="Connect a project's Facebook/Instagram/LinkedIn accounts. Bound to projects (client_projects), not clients directly — a client can run more than one business. Upload and schedule posts from the Planner."
      />

      {clientsMissingProject.length > 0 && (
        <Card className="p-4 mb-8 border-citrus/40 bg-citrus/10">
          <p className="text-small">
            These clients have no project yet, so they can&apos;t be used here until you add one on their
            client page: {clientsMissingProject.map((c) => c.name).join(", ")}.
          </p>
        </Card>
      )}

      <div className="space-y-8">
        <Card className="p-6">
          <h2 className="text-body-lg font-semibold mb-4">Facebook / Instagram connection</h2>
          <FacebookConnectPanel
            projects={projects}
            connectedAt={connection?.connected_at ?? null}
            tokenExpiresAt={connection?.fb_token_expires_at ?? null}
          />
        </Card>

        <Card className="p-6">
          <h2 className="text-body-lg font-semibold mb-4">LinkedIn connection</h2>
          <LinkedInConnectPanel projects={projects} connectedAt={connection?.li_connected_at ?? null} />
        </Card>

        <Card className="p-6">
          <h2 className="text-body-lg font-semibold mb-4">Add manual account</h2>
          <p className="text-small text-ink-muted mb-4">
            For LinkedIn, or an Instagram account not linked to a Facebook Page — paste its access token
            directly.
          </p>
          <ManualAccountForm projects={projects} />
        </Card>

        <div>
          <h2 className="text-body-lg font-semibold mb-4">Connected accounts</h2>
          <AccountsList projects={projects} accounts={(accounts ?? []) as ClientSocialAccount[]} />
        </div>
      </div>
    </>
  );
}
