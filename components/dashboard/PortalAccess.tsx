"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import { inviteToPortal, removePortalUser } from "@/lib/dashboard/actions/portal";
import type { PortalMember } from "@/lib/dashboard/portal-users";
import { formatDate } from "@/lib/dashboard/format";

/** Who at this client can sign in to the client portal, and inviting more. */
export default function PortalAccess({
  clientId,
  clientName,
  suggestedEmail,
  members,
  needsSetup,
}: {
  clientId: string;
  clientName: string;
  suggestedEmail: string | null;
  members: PortalMember[];
  needsSetup: boolean;
}) {
  const [email, setEmail] = useState(members.some((m) => m.email === suggestedEmail) ? "" : (suggestedEmail ?? ""));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invite = (target: string, resend = false) => {
    setMessage(null);
    setBusyEmail(target);
    startTransition(async () => {
      const res = await inviteToPortal(clientId, target);
      setBusyEmail(null);
      if ("error" in res && res.error) setMessage({ ok: false, text: res.error });
      else {
        setMessage({ ok: true, text: resend ? `A fresh link went to ${target}.` : `Invite sent to ${target}.` });
        if (!resend) setEmail("");
      }
    });
  };

  return (
    <Card className="p-6 mt-10 max-w-4xl">
      <h2 className="text-body-lg font-semibold">Client portal</h2>
      <p className="text-small text-ink-muted mt-1">
        People at {clientName} who can sign in at <span className="font-mono">adsbyshoaib.com/portal</span> — to send you their
        logins securely, and later see their planner and reports. They only ever see {clientName}&apos;s own things.
      </p>

      {needsSetup ? (
        <p className="text-small text-ink-muted bg-ink/[0.03] border border-ink/10 rounded-lg px-4 py-3 mt-4">
          One-time setup: run the “Client portal” section of <code className="font-mono">supabase/dashboard-schema.sql</code> in the
          Supabase SQL Editor.
        </p>
      ) : (
        <>
          {members.length > 0 && (
            <ul className="mt-4 divide-y divide-ink/5 border-y border-ink/5">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium truncate">{m.email}</span>
                    <span className="block text-xs text-ink-subtle">
                      {m.lastSignInAt ? `Last signed in ${formatDate(m.lastSignInAt)}` : `Invited ${formatDate(m.invitedAt)} — not signed in yet`}
                    </span>
                  </span>
                  <span
                    className={
                      m.lastSignInAt
                        ? "text-xs rounded-full px-2.5 py-1 bg-forest/10 border border-forest/40"
                        : "text-xs rounded-full px-2.5 py-1 bg-citrus/20 border border-citrus/60"
                    }
                  >
                    {m.lastSignInAt ? "Active" : "Invited"}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => invite(m.email, true)}
                      disabled={pending}
                      title="Send a new set-your-password link"
                      className={`${buttonStyles.secondary} px-3 py-2`}
                    >
                      {busyEmail === m.email ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
                      Resend link
                    </button>
                    <DeleteButton label="Remove access" action={() => removePortalUser(m.id)} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex flex-wrap gap-3 mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) invite(email.trim());
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@client.com"
              aria-label="Email to invite"
              className={`${inputClasses} flex-1 min-w-[14rem]`}
            />
            <button type="submit" disabled={pending || !email.trim()} className={buttonStyles.primary}>
              {pending && busyEmail === email.trim() ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
              Invite to portal
            </button>
          </form>
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
