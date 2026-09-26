"use client";

import { useState } from "react";
import { Crown, LoaderCircle, Send, Trash2, X } from "lucide-react";
import { Card, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import { createVaultRequests, deleteVaultRequest } from "@/lib/dashboard/actions/vault";
import { PLATFORMS, requestKeyLabel, type RequestKey } from "@/lib/vault-platforms";
import type { VaultRequest } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { PlatformIcon, iconButton, type VaultClient, type VaultProject } from "./shared";

const KEYS: RequestKey[] = ["master_gmail", ...PLATFORMS.map((p) => p.id)];

/**
 * Asks a client for specific accounts. They show up in the client's portal
 * as "requested", pre-added to the send form, and clear themselves once the
 * client sends that platform for that project.
 */
export default function RequestModal({
  clients,
  projects,
  requests,
  initialClientId,
  onClose,
  onChanged,
}: {
  clients: VaultClient[];
  projects: VaultProject[];
  /** Open requests across all clients. */
  requests: VaultRequest[];
  initialClientId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<RequestKey>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const clientProjects = projects.filter((p) => p.client_id === clientId);
  const open = requests.filter((r) => r.client_id === clientId);
  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? "A project") : "General");

  const toggle = (key: RequestKey) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    setError(null);
    setDone(null);
    if (!clientId) return setError("Choose a client.");
    if (picked.size === 0) return setError("Tick at least one account to ask for.");
    setBusy(true);
    const res = await createVaultRequests({ clientId, projectId, platforms: [...picked], note: note.trim() || undefined });
    setBusy(false);
    if ("error" in res && res.error) return setError(res.error);
    setDone(`Requested ${picked.size} account${picked.size === 1 ? "" : "s"} — they'll see it in their portal.`);
    setPicked(new Set());
    setNote("");
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 backdrop-blur-sm p-4 py-10">
      <Card variant="solid" className="p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-body-lg font-semibold">Request accounts from a client</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={iconButton}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <label htmlFor="req-client" className={labelClasses}>
          Client
        </label>
        <select
          id="req-client"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setProjectId(null);
          }}
          className={inputClasses}
        >
          <option value="">Choose a client…</option>
          {clients
            .filter((c) => c.is_active || c.id === clientId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>

        {clientId && (
          <>
            {clientProjects.length > 0 && (
              <div className="mt-4">
                <p className={labelClasses}>Project</p>
                <div className="flex flex-wrap gap-2">
                  {[...clientProjects.map((p) => ({ id: p.id as string | null, name: p.name })), { id: null, name: "General (no project)" }].map((p) => (
                    <button
                      key={p.id ?? "none"}
                      type="button"
                      onClick={() => setProjectId(p.id)}
                      aria-pressed={projectId === p.id}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-small transition-colors cursor-pointer",
                        projectId === p.id ? "border-ink bg-ink text-cloud" : "border-ink/20 text-ink-muted hover:text-ink"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className={cn(labelClasses, "mt-4")}>Accounts to ask for</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-small cursor-pointer",
                    picked.has(key) ? "border-ink bg-ink/5" : "border-ink/15 hover:border-ink/40"
                  )}
                >
                  <input type="checkbox" checked={picked.has(key)} onChange={() => toggle(key)} className="size-4 accent-citrus" />
                  {key === "master_gmail" ? <Crown className="size-4 shrink-0" aria-hidden /> : <PlatformIcon platform={key} className="shrink-0 text-ink-muted" />}
                  <span className="leading-tight">{requestKeyLabel(key)}</span>
                </label>
              ))}
            </div>

            <label htmlFor="req-note" className={cn(labelClasses, "mt-4")}>
              Note for the client <span className="font-normal text-ink-subtle">(optional)</span>
            </label>
            <input
              id="req-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. the Instagram used for the Choppers page"
              className={inputClasses}
            />

            {open.length > 0 && (
              <div className="mt-5">
                <p className={labelClasses}>Already requested — waiting on the client</p>
                <ul className="rounded-lg border border-ink/10 divide-y divide-ink/5">
                  {open.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-small">
                      <span className="font-medium">{requestKeyLabel(r.platform)}</span>
                      <span className="text-ink-subtle">{projectName(r.project_id)}</span>
                      {r.note && <span className="text-ink-muted truncate">— {r.note}</span>}
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteVaultRequest(r.id);
                          await onChanged();
                        }}
                        aria-label="Cancel this request"
                        title="Cancel this request"
                        className={cn(iconButton, "size-8 ml-auto")}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">{error}</p>}
        {done && <p className="text-small mt-4">{done}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Close
          </button>
          <button type="button" onClick={submit} disabled={busy || !clientId} className={buttonStyles.primary}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
            Request
          </button>
        </div>
      </Card>
    </div>
  );
}
