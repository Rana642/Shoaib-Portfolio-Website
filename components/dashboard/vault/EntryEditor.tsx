"use client";

import { useState } from "react";
import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import { Card, buttonStyles, inputClasses, labelClasses } from "@/components/dashboard/ui";
import DeleteButton from "@/components/dashboard/DeleteButton";
import { encryptSecret } from "@/lib/vault-crypto";
import { createVaultEntries, deleteVaultEntry, updateVaultEntry } from "@/lib/dashboard/actions/vault";
import { defaultTitle, emptySecret, platformLabel, trackPasswordChanges, type VaultSecret } from "@/lib/vault-platforms";
import { cn } from "@/lib/utils";
import AccountCard, { type CardDraft } from "./AccountCard";
import type { GmailOption, Item, VaultClient, VaultProject } from "./shared";

/** "own" = Shoaib's own accounts; otherwise a client id; "" = not chosen. */
type Owner = "" | "own" | string;

const OWN_LABEL = "Ads by Shoaib";

const newCard = (): CardDraft => ({
  id: crypto.randomUUID(),
  isNew: true,
  secret: emptySecret("other"),
  original: null,
  chosen: false,
  titleTouched: false,
});

/**
 * Adds several accounts at once (all filed under one client + project), or
 * edits a single saved one. Everything is encrypted here in the browser
 * before it's sent; the server only receives ciphertext and the links.
 */
export default function EntryEditor({
  item,
  items,
  initialOwner = "",
  initialProject = null,
  initialCards,
  heading,
  clients,
  projects,
  dataKey,
  onClose,
}: {
  /** Set when editing a saved entry; absent when adding new ones. */
  item?: Item;
  /** Every decrypted entry — for the Gmails a login can link to, and for
   *  which accounts sign in with a Gmail being edited. */
  items: Item[];
  initialOwner?: Owner;
  initialProject?: string | null;
  /** Pre-filled new accounts — e.g. what a client sent from the portal. */
  initialCards?: VaultSecret[];
  heading?: string;
  clients: VaultClient[];
  projects: VaultProject[];
  dataKey: CryptoKey;
  /** saved = the vault changed and should be reloaded. */
  onClose: (saved: boolean) => void;
}) {
  const editing = Boolean(item);
  const [owner, setOwner] = useState<Owner>(item ? (item.secret.own ? "own" : (item.client_id ?? "")) : initialOwner);
  const [projectId, setProjectId] = useState<string | null>(item ? item.project_id : initialProject);
  const [cards, setCards] = useState<CardDraft[]>(() =>
    item
      ? [{ id: item.id, isNew: false, secret: item.secret, original: item.secret, chosen: true, titleTouched: true }]
      : initialCards?.length
        ? initialCards.map((secret) => ({
            id: crypto.randomUUID(),
            isNew: true,
            secret,
            original: null,
            chosen: true,
            titleTouched: Boolean(secret.title),
          }))
        : [newCard()]
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientProjects = owner && owner !== "own" ? projects.filter((p) => p.client_id === owner) : [];
  const ownerName =
    owner === "own"
      ? OWN_LABEL
      : (projects.find((p) => p.id === projectId)?.name ?? clients.find((c) => c.id === owner)?.name ?? null);
  const titleOf = (c: CardDraft) =>
    c.titleTouched ? c.secret.title : c.chosen ? defaultTitle(ownerName, c.secret) : "";

  // ── Gmail links ──
  // Saved entries, minus the ones open here (their live card versions win).
  const openIds = new Set(cards.map((c) => c.id));
  const saved = items.filter((i) => !i.broken && !openIds.has(i.id));
  const sameOwner = (i: Item) => (owner === "own" ? i.secret.own : Boolean(owner) && !i.secret.own && i.client_id === owner);
  const whereOf = (project: string | null) =>
    owner === "own" ? "your own accounts" : project ? (projects.find((p) => p.id === project)?.name ?? "a project") : "client level";
  const toGmail = (id: string, secret: VaultSecret, project: string | null): GmailOption | null => {
    const email = secret.fields.email?.trim();
    return secret.platform === "google_account" && email ? { id, email, master: secret.master, where: whereOf(project) } : null;
  };
  const gmails = [
    ...saved.filter(sameOwner).map((i) => toGmail(i.id, i.secret, i.project_id)),
    ...cards.filter((c) => c.chosen).map((c) => toGmail(c.id, c.secret, projectId)),
  ]
    .filter((g): g is GmailOption => g !== null)
    .sort((a, b) => Number(b.master) - Number(a.master) || a.email.localeCompare(b.email));
  const gmailById = new Map(gmails.map((g) => [g.id, g]));

  // Everything that could be signing in with a given Gmail.
  const linkers = [
    ...saved.map((i) => ({ id: i.id, links: i.secret.links, title: i.secret.title || platformLabel(i.secret) })),
    ...cards.filter((c) => c.chosen).map((c) => ({ id: c.id, links: c.secret.links, title: titleOf(c) || platformLabel(c.secret) })),
  ];
  const usedByOf = (id: string) => linkers.filter((l) => l.id !== id && Object.values(l.links).includes(id)).map((l) => l.title);

  // Inactive clients aren't offered — unless this entry is already filed there.
  const clientOptions = clients.filter((c) => c.is_active || c.id === owner);

  const updateCard = (id: string, patch: Partial<CardDraft>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  };

  const chooseOwner = (next: Owner) => {
    setOwner(next);
    // A project belongs to one client — drop it if the client changed.
    if (!projects.some((p) => p.id === projectId && p.client_id === next)) setProjectId(null);
    setDirty(true);
  };

  const close = () => {
    if (dirty && !window.confirm("Discard the changes you haven't saved?")) return;
    onClose(false);
  };

  const save = async () => {
    setError(null);
    if (!owner) return setError("Choose whose account this is — a client, or your own.");
    const ready = cards.filter((c) => c.chosen);
    if (ready.length === 0) return setError("Pick a platform for the account first.");

    setSaving(true);
    try {
      const own = owner === "own";
      const links = { client_id: own ? null : owner, project_id: own ? null : projectId };
      const now = new Date().toISOString();
      const payloads = await Promise.all(
        ready.map(async (c) => {
          const title = titleOf(c).trim() || platformLabel(c.secret);
          // Keep only links to Gmails this owner still has, and store each
          // linked field with that Gmail's current address.
          const fields = { ...c.secret.fields };
          const kept: Record<string, string> = {};
          for (const [fieldId, target] of Object.entries(c.secret.links)) {
            const gmail = gmailById.get(target);
            if (gmail && gmail.id !== c.id) {
              kept[fieldId] = target;
              fields[fieldId] = gmail.email;
            }
          }
          const master = c.secret.platform === "google_account" && c.secret.master;
          const secret = trackPasswordChanges(c.original, { ...c.secret, own, title, master, fields, links: kept }, now);
          return { id: c.id, input: { ...links, ...(await encryptSecret(dataKey, secret)) } };
        })
      );
      const res = editing
        ? await updateVaultEntry(payloads[0].id, payloads[0].input)
        : await createVaultEntries(payloads.map((p) => ({ id: p.id, ...p.input })));
      if ("error" in res && res.error) throw new Error(res.error);
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setSaving(false);
    }
  };

  const readyCount = cards.filter((c) => c.chosen).length;

  return (
    <div>
      <button
        type="button"
        onClick={close}
        className="group inline-flex items-center gap-2 text-small text-ink-subtle hover:text-ink transition-colors mb-5 cursor-pointer"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden />
        Back to vault
      </button>
      <h2 className="font-serif italic text-h3 mb-5">{heading ?? (editing ? "Edit account" : "Add accounts")}</h2>

      <Card className="p-4 md:p-5 mb-4">
        <label htmlFor="vault-owner" className={labelClasses}>
          Whose account{editing ? " is this" : "s are these"}?
        </label>
        <select id="vault-owner" value={owner} onChange={(e) => chooseOwner(e.target.value)} className={inputClasses}>
          <option value="">Choose a client…</option>
          <optgroup label="Your own">
            <option value="own">{OWN_LABEL} (my accounts)</option>
          </optgroup>
          <optgroup label="Clients">
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>

        {owner && owner !== "own" && (
          <div className="mt-4">
            <p className={labelClasses}>Project</p>
            {clientProjects.length === 0 ? (
              <p className="text-small text-ink-muted">This client has no projects — saved at client level.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...clientProjects.map((p) => ({ id: p.id as string | null, name: p.name })), { id: null, name: "Client level (no project)" }].map(
                  (p) => (
                    <button
                      key={p.id ?? "none"}
                      type="button"
                      onClick={() => {
                        setProjectId(p.id);
                        setDirty(true);
                      }}
                      aria-pressed={projectId === p.id}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-small transition-colors cursor-pointer",
                        projectId === p.id
                          ? "border-ink bg-ink text-cloud"
                          : "border-ink/20 text-ink-muted hover:border-ink/40 hover:text-ink"
                      )}
                    >
                      {p.name}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {cards.map((c) => (
          <AccountCard
            key={c.id}
            draft={c}
            title={titleOf(c)}
            gmails={gmails.filter((g) => g.id !== c.id)}
            usedBy={usedByOf(c.id)}
            onChange={(patch) => updateCard(c.id, patch)}
            onRemove={
              !editing && cards.length > 1
                ? () => {
                    setCards((prev) => prev.filter((x) => x.id !== c.id));
                    setDirty(true);
                  }
                : undefined
            }
          />
        ))}
      </div>

      {!editing && (
        <button type="button" onClick={() => setCards((prev) => [...prev, newCard()])} className={cn(buttonStyles.secondary, "mt-4")}>
          <Plus className="size-4" aria-hidden />
          Add another account
        </button>
      )}

      <Card className="sticky bottom-4 z-20 mt-6 p-3 md:p-4">
        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {editing && item && (
            <DeleteButton
              label="Delete account"
              confirmLabel={
                usedByOf(item.id).length > 0
                  ? `Click again — ${usedByOf(item.id).length} account(s) sign in with it`
                  : "Click again to confirm"
              }
              action={async () => {
                const res = await deleteVaultEntry(item.id);
                if (res.error) return res;
                onClose(true);
                return { ok: true };
              }}
            />
          )}
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={close} className={buttonStyles.secondary}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className={buttonStyles.primary}>
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {editing ? "Save" : readyCount > 1 ? `Save ${readyCount} accounts` : "Save account"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
