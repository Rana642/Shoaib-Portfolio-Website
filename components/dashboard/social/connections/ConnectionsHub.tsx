"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, LayoutGrid, LoaderCircle, Rows3, Settings2 } from "lucide-react";
import {
  connectFacebook,
  connectLinkedIn,
  refreshFacebookPages,
  refreshLinkedInOrgs,
  removeSecondFacebookLogin,
  saveLinkedInMappings,
  saveMappings,
} from "@/lib/dashboard/actions/social";
import { buttonStyles, Card, inputClasses } from "@/components/dashboard/ui";
import ProjectCombobox from "@/components/dashboard/ProjectCombobox";
import ManualAccountForm from "@/components/dashboard/social/ManualAccountForm";
import { cn } from "@/lib/utils";
import { PLATFORMS, type ConnectionStatus, type PlatformDef, type PlatformKey, type WorkspaceLogin } from "@/lib/social-platforms";
import type { ProjectOption } from "@/lib/dashboard/types";
import type { DiscoveredPage } from "@/lib/social-fb";
import type { DiscoveredOrganization } from "@/lib/social-linkedin";
import PlatformTile, { type TileAccount, type TileAction } from "./PlatformTile";
import ConnectionsMatrix from "./ConnectionsMatrix";
import ImportModal, { type ImportItem } from "./ImportModal";
import { PlatformChip, StatusPill } from "./platform-ui";

/** Token-free account shape — the page strips encrypted tokens before
 *  anything reaches the browser. */
export type HubAccount = { id: string; project_id: string; platform: string; label: string; external_id: string };

type ImportState =
  | { provider: "facebook"; pages: DiscoveredPage[] }
  | { provider: "linkedin"; orgs: DiscoveredOrganization[] };

const byKey = (key: PlatformKey) => PLATFORMS.find((p) => p.key === key) as PlatformDef;

export default function ConnectionsHub({
  projects,
  accounts,
  tiktokFollowers,
  facebookLogin,
  facebookLogin2,
  linkedinLogin,
  clientsMissingProject,
  initialProjectId,
  autoImportFacebook,
  notice,
}: {
  projects: ProjectOption[];
  accounts: HubAccount[];
  tiktokFollowers: Record<string, number | null>;
  facebookLogin: WorkspaceLogin;
  /** A second Facebook profile with access to other clients' Pages. */
  facebookLogin2: WorkspaceLogin;
  linkedinLogin: WorkspaceLogin;
  clientsMissingProject: string[];
  initialProjectId: string | null;
  autoImportFacebook: boolean;
  /** Result of a connect round trip that came back through the URL. */
  notice?: { kind: "ok" | "error"; text: string } | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"project" | "overview">("project");
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId && projects.some((p) => p.id === initialProjectId) ? initialProjectId : projects[0]?.id ?? null
  );
  const [importing, setImporting] = useState<ImportState | null>(null);
  const [loading, setLoading] = useState<"facebook" | "linkedin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const projectLabel = useCallback((id: string) => projects.find((p) => p.id === id)?.label ?? "another project", [projects]);

  const rowsFor = useCallback(
    (pid: string, platform: string) => accounts.filter((a) => a.project_id === pid && a.platform === platform),
    [accounts]
  );

  const statusOf = useCallback(
    (pid: string, key: PlatformKey): ConnectionStatus => {
      const def = byKey(key);
      if (def.mode === "workspace") return "workspace";
      if (rowsFor(pid, key).length > 0) return "connected";
      if (key === "linkedin" && linkedinLogin.pendingApproval) return "pending";
      return "not_connected";
    },
    [rowsFor, linkedinLogin.pendingApproval]
  );

  const selectProject = (id: string) => {
    setProjectId(id);
    setView("project");
    router.replace(`/dashboard/social?project=${id}`, { scroll: false });
  };

  const openImport = useCallback((provider: "facebook" | "linkedin") => {
    setError(null);
    setLoading(provider);
    startTransition(async () => {
      if (provider === "facebook") {
        const result = await refreshFacebookPages();
        if (result?.error) setError(result.error);
        else if (result?.pages) setImporting({ provider, pages: result.pages });
      } else {
        const result = await refreshLinkedInOrgs();
        if (result?.error) setError(result.error);
        else if (result?.orgs) setImporting({ provider, orgs: result.orgs });
      }
      setLoading(null);
    });
  }, []);

  // Returning from the Facebook Login redirect lands here with ?fb=connected —
  // jump straight into the import dialog instead of making the user hunt for it.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoImportFacebook || autoRan.current) return;
    autoRan.current = true;
    openImport("facebook");
    router.replace(projectId ? `/dashboard/social?project=${projectId}` : "/dashboard/social", { scroll: false });
  }, [autoImportFacebook, openImport, router, projectId]);

  const importItems: ImportItem[] = useMemo(() => {
    if (!importing) return [];
    if (importing.provider === "facebook") {
      return importing.pages.map((p) => {
        const existing = accounts.find((a) => a.platform === "facebook" && a.external_id === p.page_id);
        return {
          id: p.page_id,
          name: p.name,
          subtitle: p.instagram_business_account_id ? "Facebook Page + Instagram" : "Facebook Page",
          importedTo: existing ? projectLabel(existing.project_id) : undefined,
        };
      });
    }
    return importing.orgs.map((o) => {
      const existing = accounts.find((a) => a.platform === "linkedin" && a.external_id === o.organization_urn);
      return { id: o.organization_urn, name: o.name, subtitle: "LinkedIn Company Page", importedTo: existing ? projectLabel(existing.project_id) : undefined };
    });
  }, [importing, accounts, projectLabel]);

  const saveImport = async (mapping: Record<string, string>) => {
    if (!importing) return;
    if (importing.provider === "facebook") {
      const chosen = importing.pages.filter((p) => mapping[p.page_id]).map((p) => ({ project_id: mapping[p.page_id], page: p }));
      return saveMappings(JSON.stringify(chosen));
    }
    const chosen = importing.orgs
      .filter((o) => mapping[o.organization_urn])
      .map((o) => ({ project_id: mapping[o.organization_urn], org: o }));
    return saveLinkedInMappings(JSON.stringify(chosen));
  };

  const tileFor = (def: PlatformDef, pid: string) => {
    const status = statusOf(pid, def.key);
    const rows = rowsFor(pid, def.key);
    const tileAccounts: TileAccount[] = rows.map((r) => ({
      id: r.id,
      label: r.label,
      detail:
        def.key === "tiktok" && tiktokFollowers[r.id] != null
          ? `${tiktokFollowers[r.id]!.toLocaleString()} followers`
          : undefined,
    }));

    let note: string | undefined;
    let action: TileAction | null = null;

    if (def.mode === "workspace") {
      note = "Covered for every project by the workspace System User. Connect to verify this client's ad accounts.";
      action = def.connectHref ? { kind: "link", label: "Verify ad access", href: def.connectHref(pid) } : null;
    } else if (def.key === "google_business") {
      note = rows.length
        ? "Reviews, replies and Planner posts go through Socially Snap, one at a time (Google-friendly pace)."
        : "Connect with Google, or reuse the Google sign-in already connected on another project.";
      action = def.connectHref ? { kind: "link", label: rows.length ? "Open Google Business" : "Connect Google Business", href: def.connectHref(pid) } : null;
    } else if (def.mode === "project_oauth") {
      note = `Authorize ${def.label} for this project.`;
      action = def.connectHref ? { kind: "link", label: rows.length ? "Connect another" : `Connect ${def.label}`, href: def.connectHref(pid) } : null;
    } else if (def.key === "instagram") {
      // Page-linked accounts arrive with the Facebook import; the rest log
      // in with Instagram (each must be an Instagram Tester on the app).
      // The account joins whichever project is picked above — say which, so
      // a second client's account isn't added to the wrong one (2026-10-01).
      const projectName = projectLabel(pid);
      note = `Linked to the client's Facebook Page? It comes in with the Page import. Otherwise log in with Instagram — the account you log in with joins ${projectName}. For another project, pick it above first.`;
      action = { kind: "link", label: `Log in with Instagram for ${projectName}`, href: `/api/dashboard/social/instagram/authorize?project_id=${pid}` };
    } else if (def.loginProvider === "facebook") {
      if (!facebookLogin.connectedAt) {
        note = "Connect your Facebook Business login first.";
        action = { kind: "link", label: "Connect Facebook login", href: "/api/dashboard/social/facebook/authorize" };
      } else {
        note = "Import this client's Page from your Facebook login.";
        action = rows.length
          ? null
          : { kind: "button", label: "Import from Facebook", onClick: () => openImport("facebook"), busy: loading === "facebook" };
      }
    } else if (def.loginProvider === "linkedin") {
      const personalHref = `/api/dashboard/social/linkedin-personal/authorize?project_id=${pid}`;
      if (linkedinLogin.pendingApproval && !linkedinLogin.connectedAt) {
        note = rows.length
          ? "Personal profile connected (reconnect every 60 days). Company Pages unlock once LinkedIn approves Community Management API access."
          : "Company Pages unlock once LinkedIn approves Community Management API access. A personal profile can be connected now.";
        action = { kind: "link", label: rows.length ? "Reconnect personal profile" : "Connect personal profile", href: personalHref };
      } else {
        note = "Import this client's Company Page from your LinkedIn login.";
        action = rows.length ? null : { kind: "button", label: "Import from LinkedIn", onClick: () => openImport("linkedin"), busy: loading === "linkedin" };
      }
    }

    return <PlatformTile key={def.key} platform={def} status={status} accounts={tileAccounts} note={note} action={action} />;
  };

  const coverage = projectId
    ? PLATFORMS.filter((p) => ["connected", "workspace"].includes(statusOf(projectId, p.key))).length
    : 0;

  return (
    <div className="space-y-8">
      {/* Workspace logins */}
      <section>
        <SectionLabel>Workspace logins</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LoginCard
            platform={byKey("facebook")}
            title="Facebook Business login"
            subtitle="Discovers every Page & linked Instagram you admin"
            login={facebookLogin}
            primary={{ label: facebookLogin.connectedAt ? "Reconnect" : "Connect with Facebook", href: "/api/dashboard/social/facebook/authorize" }}
            onImport={facebookLogin.connectedAt ? () => openImport("facebook") : undefined}
            importing={loading === "facebook"}
          />
          <LoginCard
            platform={byKey("facebook")}
            title="Second Facebook login"
            subtitle="Another profile with access to client Pages. Import Pages lists both logins' Pages."
            login={facebookLogin2}
            primary={{ label: facebookLogin2.connectedAt ? "Reconnect" : "Connect second profile", href: "/api/dashboard/social/facebook/authorize?slot=2" }}
            onImport={facebookLogin2.connectedAt ? () => openImport("facebook") : undefined}
            importing={loading === "facebook"}
            onRemove={
              facebookLogin2.connectedAt
                ? () =>
                    startTransition(async () => {
                      const res = await removeSecondFacebookLogin();
                      if (res?.error) setError(res.error);
                      else router.refresh();
                    })
                : undefined
            }
            hint={facebookLogin2.connectedAt ? undefined : "Log out of Facebook in this browser first (or use a private window), so Facebook asks which profile to use."}
          />
          <LoginCard
            platform={byKey("linkedin")}
            title="LinkedIn login"
            subtitle="Discovers Company Pages you administer"
            login={linkedinLogin}
            onImport={linkedinLogin.connectedAt ? () => openImport("linkedin") : undefined}
            importing={loading === "linkedin"}
          />
        </div>
        {error && (
          <p className="mt-4 text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>
        )}
        {notice && (
          <p
            className={`mt-4 text-small rounded-lg px-4 py-3 border ${
              notice.kind === "ok" ? "text-ink bg-forest/10 border-forest/30" : "text-red-700 bg-red-500/10 border-red-600/20"
            }`}
          >
            {notice.text}
          </p>
        )}
      </section>

      {/* Project connections */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <SectionLabel className="mb-0">Client connections</SectionLabel>
          <div className="inline-flex rounded-xl border border-ink/10 bg-white/70 p-1" role="tablist">
            <ViewTab active={view === "project"} onClick={() => setView("project")} icon={LayoutGrid} label="By project" />
            <ViewTab active={view === "overview"} onClick={() => setView("overview")} icon={Rows3} label="All projects" />
          </div>
        </div>

        {projects.length === 0 ? (
          <Card className="p-8 text-center text-small text-ink-muted">Add a project on a client page to start connecting accounts.</Card>
        ) : view === "overview" ? (
          <ConnectionsMatrix projects={projects} statusOf={statusOf} onOpen={selectProject} />
        ) : (
          <>
            {/* relative z-20: the glass card's backdrop-filter makes its own
                stacking context, so without lifting the whole card the
                project dropdown opens *under* the platform tiles below. */}
            <Card className="relative z-20 p-4 sm:p-5 mb-5">
              <div className="flex flex-wrap items-center gap-4">
                <ProjectCombobox
                  className="flex-1 min-w-64"
                  options={projects.map((p) => ({
                    id: p.id,
                    label: p.label,
                    search: p.client,
                    meta: `${PLATFORMS.filter((pl) => ["connected", "workspace"].includes(statusOf(p.id, pl.key))).length}/${PLATFORMS.length}`,
                  }))}
                  value={projectId}
                  onChange={selectProject}
                />
                <div className="flex items-center gap-3">
                  <div className="relative size-12">
                    <svg viewBox="0 0 36 36" className="size-12 -rotate-90">
                      <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-ink/10" strokeWidth="3.5" />
                      <circle
                        cx="18"
                        cy="18"
                        r="15.5"
                        fill="none"
                        className="stroke-forest transition-all duration-500"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(coverage / PLATFORMS.length) * 97.4} 97.4`}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-tag font-semibold tabular-nums">
                      {coverage}/{PLATFORMS.length}
                    </span>
                  </div>
                  <div>
                    <p className="text-small font-medium">Platforms ready</p>
                    <p className="text-tag text-ink-subtle">for this project</p>
                  </div>
                </div>
              </div>
            </Card>

            {projectId && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{PLATFORMS.map((def) => tileFor(def, projectId))}</div>}
          </>
        )}

        {clientsMissingProject.length > 0 && (
          <p className="mt-4 text-tag text-ink-subtle">
            Not listed (no project yet): {clientsMissingProject.join(", ")} — add a project on their client page.
          </p>
        )}
      </section>

      <AdvancedSection projects={projects} onDiscovered={setImporting} />

      {importing && (
        <ImportModal
          title={importing.provider === "facebook" ? "Import Facebook Pages" : "Import LinkedIn Pages"}
          description={
            importing.provider === "facebook"
              ? "Pick the Pages to bring in. A linked Instagram Business account is imported alongside its Page."
              : "Pick the Company Pages to bring in and assign each to a project."
          }
          items={importItems}
          projects={projects}
          defaultProjectId={projectId}
          onSave={saveImport}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3", className)}>{children}</p>;
}

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-small font-medium transition-all",
        active ? "bg-ink text-cloud shadow-sm" : "text-ink-muted hover:text-ink"
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function LoginCard({
  platform,
  title,
  subtitle,
  login,
  primary,
  onImport,
  importing,
  onRemove,
  hint,
}: {
  platform: PlatformDef;
  title: string;
  subtitle: string;
  login: WorkspaceLogin;
  primary?: { label: string; href: string };
  onImport?: () => void;
  importing: boolean;
  onRemove?: () => void;
  hint?: string;
}) {
  const expiresSoon = Boolean(login.expiresSoon);
  // Fixed locale + zone so server and browser render the same string (no hydration mismatch).
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });

  let status: ConnectionStatus = login.connectedAt ? "connected" : "not_connected";
  let pillLabel: string | undefined;
  if (!login.connectedAt && login.pendingApproval) status = "pending";
  if (login.connectedAt && expiresSoon) {
    status = "pending";
    pillLabel = "Expires soon";
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <PlatformChip platform={platform} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{title}</p>
            <StatusPill status={status} label={pillLabel} />
          </div>
          <p className="text-tag text-ink-subtle mt-1">{subtitle}</p>
          <p className="text-small text-ink-muted mt-2">
            {login.connectedAt
              ? `${login.accountName ? `${login.accountName} · ` : ""}Connected ${fmt(login.connectedAt)}${login.expiresAt ? ` · valid until ${fmt(login.expiresAt)}` : ""}`
              : login.pendingApproval
                ? "Waiting on the platform's API access review."
                : "Not connected yet."}
          </p>
          {hint && <p className="text-tag text-ink-subtle mt-1">{hint}</p>}
          <div className="flex flex-wrap gap-2 mt-4">
            {onImport && (
              <button type="button" onClick={onImport} disabled={importing} className={buttonStyles.primary}>
                {importing && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Import Pages
              </button>
            )}
            {primary && (
              <a href={primary.href} className={buttonStyles.secondary}>
                {primary.label}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Remove this Facebook login? Pages already imported through it keep posting.")) onRemove();
                }}
                className={buttonStyles.danger}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AdvancedSection({
  projects,
  onDiscovered,
}: {
  projects: ProjectOption[];
  onDiscovered: (state: ImportState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pasteConnect = (provider: "facebook" | "linkedin") => (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      if (provider === "facebook") {
        const result = await connectFacebook(formData);
        if (result?.error) setError(result.error);
        else if (result?.pages) onDiscovered({ provider, pages: result.pages });
      } else {
        const result = await connectLinkedIn(formData);
        if (result?.error) setError(result.error);
        else if (result?.orgs) onDiscovered({ provider, orgs: result.orgs });
      }
    });
  };

  return (
    <details className="group rounded-2xl border border-ink/10 bg-white/50">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-5 py-4">
        <span className="flex items-center gap-3">
          <Settings2 className="size-4 text-ink-subtle" aria-hidden />
          <span>
            <span className="block text-small font-medium">Advanced</span>
            <span className="block text-tag text-ink-subtle">Manual tokens & accounts not reachable through a login</span>
          </span>
        </span>
        <ChevronDown className="size-4 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-5 pb-6 pt-2 space-y-8 border-t border-ink/10">
        <div className="grid gap-6 md:grid-cols-2 pt-4">
          <PasteForm
            label="Facebook User Access Token"
            hint="Graph API Explorer token with pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish."
            placeholder="EAAG…"
            action={pasteConnect("facebook")}
            pending={pending}
          />
          <PasteForm
            label="LinkedIn Member Access Token"
            hint="From your LinkedIn app's OAuth Token Generator, with r_organization_admin and w_organization_social."
            placeholder="AQV…"
            action={pasteConnect("linkedin")}
            pending={pending}
          />
        </div>
        {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>}
        <div>
          <p className="text-small font-medium mb-1">Add an account manually</p>
          <p className="text-tag text-ink-subtle mb-4">For an Instagram account not linked to a Facebook Page, or a LinkedIn fallback.</p>
          <ManualAccountForm projects={projects} />
        </div>
      </div>
    </details>
  );
}

function PasteForm({
  label,
  hint,
  placeholder,
  action,
  pending,
}: {
  label: string;
  hint: string;
  placeholder: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form action={action} className="space-y-2">
      <label className="block text-small font-medium">{label}</label>
      <div className="flex gap-2">
        <input name="token" placeholder={placeholder} className={inputClasses} />
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Connect
        </button>
      </div>
      <p className="text-tag text-ink-subtle">{hint}</p>
    </form>
  );
}
