"use client";

import { useState } from "react";
import { Check, LoaderCircle, Mail, X } from "lucide-react";
import { Card, buttonStyles } from "@/components/dashboard/ui";
import { sendPasswordChangeNotice } from "@/lib/dashboard/actions/vault";
import { accountLabel, platformLabel } from "@/lib/vault-platforms";
import { iconButton, type Item, type VaultClient, type VaultProject } from "./shared";

/**
 * Tells a client which of their accounts had a password changed. The email
 * lists accounts only — never a password — and is previewed here before
 * anything is sent. "Mark as told" covers telling them some other way.
 */
export default function NotifyClientModal({
  client,
  items,
  projects,
  onClose,
  onMarkTold,
}: {
  client: VaultClient;
  items: Item[];
  projects: VaultProject[];
  onClose: () => void;
  /** Records the change as communicated on these entries. */
  onMarkTold: (items: Item[]) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<"send" | "mark" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const lines = items.map((i) => {
    const project = projects.find((p) => p.id === i.project_id)?.name;
    const account = accountLabel(i.secret);
    return `${platformLabel(i.secret)}${account ? ` — ${account}` : ""}${project ? ` (${project})` : ""}`;
  });

  const run = async (kind: "send" | "mark") => {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "send") {
        const res = await sendPasswordChangeNotice(client.id, lines);
        if ("error" in res) throw new Error(res.error);
        const markError = await onMarkTold(items);
        if (markError) throw new Error(`The email went to ${res.sentTo}, but recording that failed: ${markError}`);
        setSentTo(res.sentTo);
      } else {
        const markError = await onMarkTold(items);
        if (markError) throw new Error(markError);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 backdrop-blur-sm p-4 py-10">
      <Card variant="solid" className="p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-body-lg font-semibold">Tell {client.name} about the password changes</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={iconButton}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {sentTo ? (
          <>
            <p className="flex items-center gap-2 text-small">
              <Check className="size-4 text-forest" aria-hidden />
              Email sent to {sentTo}.
            </p>
            <button type="button" onClick={onClose} className={`${buttonStyles.primary} mt-5`}>
              Done
            </button>
          </>
        ) : (
          <>
            <p className="text-small text-ink-muted">
              {client.email ? (
                <>
                  This emails <span className="text-ink">{client.email}</span> that the password on these accounts was changed
                  for security. The new passwords are <strong>not</strong> included — they stay in your vault.
                </>
              ) : (
                <>This client has no email on file, so you can only mark this as told (e.g. after a WhatsApp message).</>
              )}
            </p>

            <ul className="mt-4 rounded-lg border border-ink/10 bg-ink/[0.02] px-4 py-3 space-y-1.5 text-small list-disc pl-8">
              {lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>

            {error && (
              <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">{error}</p>
            )}

            <div className="flex flex-wrap justify-end gap-3 mt-6">
              <button type="button" onClick={() => run("mark")} disabled={busy !== null} className={buttonStyles.secondary}>
                {busy === "mark" && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Mark as told, no email
              </button>
              {client.email && (
                <button type="button" onClick={() => run("send")} disabled={busy !== null} className={buttonStyles.primary}>
                  {busy === "send" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Mail className="size-4" aria-hidden />}
                  Send email
                </button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
