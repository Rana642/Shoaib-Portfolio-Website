"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Mail, Pencil, RefreshCw } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import AccessPicker, { type MemberAccess } from "./AccessPicker";
import { featureLabel, type PortalFeature } from "@/lib/portal/features";
import { inviteTeamMember, removeTeamMember, resendTeamInvite, updateTeamMember } from "@/lib/portal/team";

type Member = {
  id: string;
  userId: string;
  email: string;
  role: "owner" | "member";
  permissions: string[];
  projectIds: string[] | null;
  active: boolean;
};

// What a new team member starts with — the everyday, low-risk ones.
const STARTER: PortalFeature[] = ["intakes", "planner", "uploads"];

export default function TeamManager({
  me,
  members,
  grantable,
  projects,
}: {
  me: string;
  members: Member[];
  /** The Owner's own features (minus "team") — all they can hand out. */
  grantable: PortalFeature[];
  projects: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<MemberAccess>({ permissions: STARTER.filter((f) => grantable.includes(f)), projectIds: null });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberAccess>({ permissions: [], projectIds: null });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <div className="mt-8 space-y-6">
      <Card variant="solid" className="p-5 md:p-6">
        <h2 className="text-body-lg font-semibold mb-3">People with access</h2>
        <ul className="divide-y divide-ink/5">
          {members.map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="min-w-0 mr-auto">
                  <span className="block font-medium truncate">
                    {m.email}
                    {m.userId === me && <span className="font-normal text-ink-subtle"> (you)</span>}
                  </span>
                  <span className="block text-xs text-ink-subtle">
                    {m.role === "owner"
                      ? "Owner — everything switched on for this portal"
                      : `${m.permissions.length ? m.permissions.map(featureLabel).join(", ") : "No features yet"} · ${
                          m.projectIds ? m.projectIds.map(projectName).join(", ") : "All projects"
                        }`}
                  </span>
                </span>
                <span className="text-xs rounded-full px-2.5 py-1 border border-ink/15">
                  {m.role === "owner" ? "Owner" : m.active ? "Team member" : "Invited"}
                </span>
                {m.role === "member" && (
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(editing === m.id ? null : m.id);
                        setDraft({ permissions: m.permissions.filter((p) => grantable.includes(p as PortalFeature)), projectIds: m.projectIds });
                      }}
                      className={`${buttonStyles.secondary} px-3 py-2`}
                    >
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </button>
                    {!m.active && (
                      <button type="button" onClick={() => run(() => resendTeamInvite(m.id), `A fresh link went to ${m.email}.`)} disabled={pending} className={`${buttonStyles.secondary} px-3 py-2`}>
                        <RefreshCw className="size-4" aria-hidden />
                        Resend
                      </button>
                    )}
                    <DeleteButton label="Remove" action={() => removeTeamMember(m.id)} />
                  </span>
                )}
              </div>
              {editing === m.id && (
                <div className="mt-4 rounded-xl border border-ink/10 p-4">
                  <AccessPicker idPrefix={`edit-${m.id}`} features={grantable} projects={projects} value={draft} onChange={setDraft} />
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => updateTeamMember(m.id, draft.permissions, draft.projectIds), "Saved.", () => setEditing(null))}
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
      </Card>

      <Card variant="solid" className="p-5 md:p-6">
        <h2 className="text-body-lg font-semibold">Add a team member</h2>
        <p className="text-small text-ink-muted mt-1 mb-4">They&apos;ll get an email to set their own password.</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          aria-label="Their email"
          className={`${inputClasses} mb-4`}
        />
        <AccessPicker idPrefix="invite" features={grantable} projects={projects} value={access} onChange={setAccess} />
        <button
          type="button"
          disabled={pending || !email.trim()}
          onClick={() =>
            run(() => inviteTeamMember(email.trim(), access.permissions, access.projectIds), `Invite sent to ${email.trim()}.`, () => setEmail(""))
          }
          className={`${buttonStyles.primary} mt-5`}
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
          Send invite
        </button>
      </Card>

      {message && (
        <p
          className={
            message.ok
              ? "flex items-center gap-2 text-small"
              : "text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3"
          }
        >
          {message.ok && <Check className="size-4 text-forest" aria-hidden />}
          {message.text}
        </p>
      )}
    </div>
  );
}
