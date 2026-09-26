"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Mail, Pencil, RefreshCw } from "lucide-react";
import { Card, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import AccessPicker, { type MemberAccess } from "@/components/portal/AccessPicker";
import { inviteToPortal, removePortalUser, setPortalFeatures, updatePortalMember } from "@/lib/dashboard/actions/portal";
import type { PortalMember } from "@/lib/dashboard/portal-users";
import { PORTAL_FEATURES, featureLabel, type PortalFeature, type PortalRole } from "@/lib/portal/features";
import { formatDate } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";

/**
 * Who at this client can use the portal, and what's switched on for them.
 * Access flows down: the features ticked here are what the Owner(s) get;
 * team members get a subset — from their Owner in the portal, or from here.
 */
export default function PortalAccess({
  clientId,
  clientName,
  suggestedEmail,
  members,
  features: initialFeatures,
  projects,
  needsSetup,
  rolesReady,
}: {
  clientId: string;
  clientName: string;
  suggestedEmail: string | null;
  members: PortalMember[];
  features: string[];
  projects: { id: string; name: string }[];
  needsSetup: boolean;
  rolesReady: boolean;
}) {
  const [features, setFeatures] = useState<string[]>(initialFeatures);
  const [featuresDirty, setFeaturesDirty] = useState(false);
  const [email, setEmail] = useState(members.some((m) => m.email === suggestedEmail) ? "" : (suggestedEmail ?? ""));
  const [inviteRole, setInviteRole] = useState<PortalRole>(members.some((m) => m.role === "owner") ? "member" : "owner");
  const [inviteAccess, setInviteAccess] = useState<MemberAccess>({ permissions: [], projectIds: null });
  const [editing, setEditing] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState<PortalRole>("member");
  const [draft, setDraft] = useState<MemberAccess>({ permissions: [], projectIds: null });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const memberFeatures = features.filter((f): f is PortalFeature => f !== "team") as PortalFeature[];
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "A project";
  const run = (fn: () => Promise<{ ok?: boolean } | { error: string }>, okText: string, after?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      const res = await fn();
      if ("error" in res) setMessage({ ok: false, text: res.error });
      else {
        setMessage({ ok: true, text: okText });
        after?.();
      }
    });
  };

  const roleSelect = (id: string, value: PortalRole, onChange: (r: PortalRole) => void) => (
    <div>
      <label htmlFor={id} className={labelClasses}>
        Role
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as PortalRole)} className={inputClasses}>
        <option value="owner">Owner — everything switched on above</option>
        <option value="member">Team member — only what&apos;s ticked</option>
      </select>
    </div>
  );

  return (
    <Card className="p-6 mt-10 max-w-4xl">
      <h2 className="text-body-lg font-semibold">Client portal</h2>
      <p className="text-small text-ink-muted mt-1">
        People at {clientName} who can sign in at <span className="font-mono">adsbyshoaib.com/portal</span>. They only ever see{" "}
        {clientName}&apos;s own things.
      </p>

      {needsSetup ? (
        <p className="text-small text-ink-muted bg-ink/[0.03] border border-ink/10 rounded-lg px-4 py-3 mt-4">
          One-time setup: run the “Client portal” section of <code className="font-mono">supabase/dashboard-schema.sql</code> in the
          Supabase SQL Editor.
        </p>
      ) : (
        <>
          {!rolesReady && (
            <p className="text-small text-ink-muted bg-citrus/10 border border-citrus/40 rounded-lg px-4 py-3 mt-4">
              One-time setup for roles and features: run the “Client portal roles” section of{" "}
              <code className="font-mono">supabase/dashboard-schema.sql</code>. Until then everyone here is an Owner.
            </p>
          )}

          {/* What the Owner(s) get */}
          <div className="mt-5">
            <p className={labelClasses}>Switched on for this client</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PORTAL_FEATURES.map((f) => (
                <label key={f.key} className="flex items-start gap-2.5 rounded-lg border border-ink/10 bg-white px-3 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.includes(f.key)}
                    onChange={() => {
                      setFeatures((prev) => (prev.includes(f.key) ? prev.filter((x) => x !== f.key) : [...prev, f.key]));
                      setFeaturesDirty(true);
                    }}
                    className="size-4 mt-0.5 accent-citrus cursor-pointer"
                  />
                  <span>
                    <span className="block text-small font-medium">{f.label}</span>
                    <span className="block text-xs text-ink-subtle">{f.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {featuresDirty && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setPortalFeatures(clientId, features), "Features saved.", () => setFeaturesDirty(false))}
                className={`${buttonStyles.primary} mt-3`}
              >
                {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Save features
              </button>
            )}
          </div>

          {/* People */}
          {members.length > 0 && (
            <ul className="mt-6 divide-y divide-ink/5 border-y border-ink/5">
              {members.map((m) => (
                <li key={m.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="min-w-0 mr-auto">
                      <span className="block font-medium truncate">{m.email}</span>
                      <span className="block text-xs text-ink-subtle">
                        {m.role === "owner"
                          ? "Owner"
                          : `Team member · ${m.permissions.length ? m.permissions.map(featureLabel).join(", ") : "nothing ticked"} · ${
                              m.projectIds ? m.projectIds.map(projectName).join(", ") : "all projects"
                            }`}
                        {" · "}
                        {m.lastSignInAt ? `last signed in ${formatDate(m.lastSignInAt)}` : `invited ${formatDate(m.invitedAt)}, not signed in yet`}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-xs rounded-full px-2.5 py-1 border",
                        m.lastSignInAt ? "bg-forest/10 border-forest/40" : "bg-citrus/20 border-citrus/60"
                      )}
                    >
                      {m.lastSignInAt ? "Active" : "Invited"}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {rolesReady && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(editing === m.id ? null : m.id);
                            setDraftRole(m.role);
                            setDraft({ permissions: m.permissions, projectIds: m.projectIds });
                          }}
                          className={`${buttonStyles.secondary} px-3 py-2`}
                        >
                          <Pencil className="size-4" aria-hidden />
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            () => inviteToPortal(clientId, m.email, { role: m.role, permissions: m.permissions, projectIds: m.projectIds }),
                            `A fresh link went to ${m.email}.`
                          )
                        }
                        disabled={pending}
                        title="Send a new set-your-password link"
                        className={`${buttonStyles.secondary} px-3 py-2`}
                      >
                        <RefreshCw className="size-4" aria-hidden />
                        Resend link
                      </button>
                      <DeleteButton label="Remove access" action={() => removePortalUser(m.id)} />
                    </span>
                  </div>
                  {editing === m.id && (
                    <div className="mt-4 rounded-xl border border-ink/10 bg-white p-4 space-y-4">
                      {roleSelect(`role-${m.id}`, draftRole, setDraftRole)}
                      {draftRole === "member" && (
                        <AccessPicker idPrefix={`edit-${m.id}`} features={memberFeatures} projects={projects} value={draft} onChange={setDraft} />
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            run(() => updatePortalMember(m.id, { role: draftRole, ...draft }), "Saved.", () => setEditing(null))
                          }
                          className={buttonStyles.primary}
                        >
                          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className={buttonStyles.secondary}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Invite */}
          <div className="mt-5 space-y-4">
            <p className="font-medium">Invite someone</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="invite-email" className={labelClasses}>
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@client.com"
                  className={inputClasses}
                />
              </div>
              {rolesReady && roleSelect("invite-role", inviteRole, setInviteRole)}
            </div>
            {rolesReady && inviteRole === "member" && (
              <AccessPicker idPrefix="invite" features={memberFeatures} projects={projects} value={inviteAccess} onChange={setInviteAccess} />
            )}
            <button
              type="button"
              disabled={pending || !email.trim()}
              onClick={() =>
                run(
                  () => inviteToPortal(clientId, email.trim(), { role: rolesReady ? inviteRole : "owner", ...inviteAccess }),
                  `Invite sent to ${email.trim()}.`,
                  () => setEmail("")
                )
              }
              className={buttonStyles.primary}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
              Invite to portal
            </button>
          </div>
        </>
      )}

      {message && (
        <p
          className={
            message.ok
              ? "flex items-center gap-2 text-small mt-3"
              : "text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-3"
          }
        >
          {message.ok && <Check className="size-4 text-forest" aria-hidden />}
          {message.text}
        </p>
      )}
    </Card>
  );
}
