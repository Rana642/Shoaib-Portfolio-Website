"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, KeyRound, Lock, Plus, RefreshCw, Search, Send } from "lucide-react";
import {
  setupVault,
  unlockWithPassword,
  unlockWithRecovery,
  rewrapMaster,
  rewrapRecovery,
  encryptSecret,
  decryptSecret,
  generateVaultKeypair,
  unwrapVaultPrivateKey,
  openVaultSeal,
} from "@/lib/vault-crypto";
import {
  getVaultMeta,
  setupVaultMeta,
  updateVaultMaster,
  updateVaultRecovery,
  listVaultEntries,
  updateVaultEntry,
  setVaultKeypair,
  listVaultSubmissions,
  listVaultRequests,
  markSubmissionImported,
} from "@/lib/dashboard/actions/vault";
import { normalizeSecret, platformLabel, sanitizeSubmitted, securityIssues, type VaultSecret } from "@/lib/vault-platforms";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { VaultEntry, VaultMeta, VaultRequest } from "@/lib/dashboard/types";
import { formatDate } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import { ChangeMasterModal, RecoveryKeyModal, SetupScreen, UnlockScreen } from "./vault/LockScreens";
import EntryEditor from "./vault/EntryEditor";
import VaultList from "./vault/VaultList";
import NotifyClientModal from "./vault/NotifyClientModal";
import RequestModal from "./vault/RequestModal";
import type { Item, VaultClient, VaultProject } from "./vault/shared";

const AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes idle

/** What a client sent from the portal, opened in the unlocked browser. */
type InboxItem = {
  id: string;
  client_id: string;
  project_id: string | null;
  created_at: string;
  accounts: VaultSecret[];
  /** Couldn't be opened — can only be discarded. */
  broken: boolean;
};

type View =
  | { kind: "list" }
  | { kind: "add"; owner: string }
  | { kind: "edit"; item: Item }
  | { kind: "import"; submission: InboxItem };

async function decryptAll(key: CryptoKey, rows: VaultEntry[]): Promise<Item[]> {
  return Promise.all(
    rows.map(async (r) => {
      const links = { id: r.id, client_id: r.client_id, project_id: r.project_id ?? null };
      try {
        return { ...links, secret: normalizeSecret(await decryptSecret<unknown>(key, r.ciphertext, r.iv)), broken: false };
      } catch {
        return { ...links, secret: normalizeSecret(null), broken: true };
      }
    })
  );
}

export default function VaultApp({
  meta,
  clients,
  projects,
}: {
  meta: VaultMeta | null;
  clients: VaultClient[];
  projects: VaultProject[];
}) {
  const [dataKey, setDataKey] = useState<CryptoKey | null>(null);
  const dkRawRef = useRef<Uint8Array | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  // A freshly-minted recovery key, held only long enough to show it once.
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const [changingMaster, setChangingMaster] = useState(false);
  const [notify, setNotify] = useState<{ clientId: string; items: Item[] } | null>(null);
  // Client-portal side: the vault's private key (only while unlocked), what
  // clients have sent, and the accounts I've asked them for.
  const privateKeyRef = useRef<CryptoKey | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [requests, setRequests] = useState<VaultRequest[]>([]);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  // Always read entries fresh, so another tab's (or device's) changes show.
  const reload = useCallback(async (key: CryptoKey) => {
    setItems(await decryptAll(key, await listVaultEntries()));
  }, []);

  const lock = useCallback(() => {
    setDataKey(null);
    dkRawRef.current = null;
    setItems([]);
    setView({ kind: "list" });
    setNewRecoveryKey(null);
    setChangingMaster(false);
    setNotify(null);
    privateKeyRef.current = null;
    setInbox([]);
    setRequests([]);
    setRequesting(null);
    setPortalReady(false);
  }, []);

  const loadPortal = useCallback(async () => {
    const privateKey = privateKeyRef.current;
    if (!privateKey) return;
    const [submissions, openRequests] = await Promise.all([listVaultSubmissions(), listVaultRequests()]);
    setRequests(openRequests);
    setInbox(
      await Promise.all(
        submissions.map(async (s) => {
          const base = { id: s.id, client_id: s.client_id, project_id: s.project_id, created_at: s.created_at };
          try {
            const payload = await openVaultSeal<{ accounts?: unknown[] }>(privateKey, s);
            const accounts = Array.isArray(payload.accounts) ? payload.accounts.slice(0, 30).map(sanitizeSubmitted) : [];
            return { ...base, accounts, broken: false };
          } catch {
            return { ...base, accounts: [], broken: true };
          }
        })
      )
    );
  }, []);

  // The portal keypair: minted once, on the first unlock after the portal
  // shipped; after that just unwrapped. If the database isn't ready for it
  // yet, the portal features simply stay hidden.
  const preparePortal = useCallback(
    async (key: CryptoKey, current: VaultMeta) => {
      try {
        let wrapped = current.wrapped_private_key;
        let iv = current.wrapped_private_key_iv;
        if (!current.public_key) {
          const keypair = await generateVaultKeypair(key);
          const res = await setVaultKeypair(keypair);
          if ("error" in res && res.error) return;
          if ("stored" in res && res.stored) {
            wrapped = keypair.wrapped_private_key;
            iv = keypair.wrapped_private_key_iv;
          } else {
            // Another tab got there first — use the key it stored.
            const fresh = await getVaultMeta();
            wrapped = fresh?.wrapped_private_key ?? null;
            iv = fresh?.wrapped_private_key_iv ?? null;
          }
        }
        if (!wrapped || !iv) return;
        privateKeyRef.current = await unwrapVaultPrivateKey(key, wrapped, iv);
        setPortalReady(true);
        await loadPortal();
      } catch {
        /* portal features stay hidden this session */
      }
    },
    [loadPortal]
  );

  // Auto-lock after idle — unsaved edits are dropped with the key.
  useEffect(() => {
    if (!dataKey) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump));
    const iv = setInterval(() => {
      if (Date.now() - last > AUTO_LOCK_MS) lock();
    }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, [dataKey, lock]);

  // Opens the vault with a data key: load and decrypt every entry first.
  const open = async (key: CryptoKey, dkRaw: Uint8Array, current: VaultMeta) => {
    try {
      await reload(key);
    } catch {
      setError("Unlocked, but the entries couldn't be loaded. Check your connection and try again.");
      return;
    }
    dkRawRef.current = dkRaw;
    setDataKey(key);
    void preparePortal(key, current);
  };

  // ── Locked / setup screens ───────────────────────────────────
  if (!dataKey) {
    return meta ? (
      <UnlockScreen
        busy={busy}
        error={error}
        onUnlock={async (pw) => {
          setError(null);
          setBusy(true);
          try {
            // Fresh meta: the prop is stale if the master password changed
            // since this page loaded.
            const current = (await getVaultMeta()) ?? meta;
            let unlocked;
            try {
              unlocked = await unlockWithPassword(current, pw);
            } catch {
              setError("Wrong master password.");
              return;
            }
            await open(unlocked.dataKey, unlocked.dkRaw, current);
          } finally {
            setBusy(false);
          }
        }}
        onRecover={async (recoveryKey, newPw) => {
          setError(null);
          setBusy(true);
          try {
            const current = (await getVaultMeta()) ?? meta;
            let unlocked;
            try {
              unlocked = await unlockWithRecovery(current, recoveryKey);
            } catch {
              setError("That recovery key didn't work.");
              return;
            }
            const res = await updateVaultMaster(await rewrapMaster(unlocked.dkRaw, newPw));
            if (res?.error) {
              setError(`The key worked, but the new password couldn't be saved: ${res.error}`);
              return;
            }
            await open(unlocked.dataKey, unlocked.dkRaw, current);
          } finally {
            setBusy(false);
          }
        }}
      />
    ) : (
      <SetupScreen
        busy={busy}
        error={error}
        onSetup={async (pw) => {
          setError(null);
          setBusy(true);
          try {
            const { meta: m, recoveryKey } = await setupVault(pw);
            const res = await setupVaultMeta(m);
            if (res?.error) throw new Error(res.error);
            return recoveryKey; // shown once; "Open my vault" reloads to the unlock screen
          } catch (e) {
            setError(e instanceof Error ? e.message : "Setup failed.");
            return null;
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  // ── Add / edit / import ──────────────────────────────────────
  if (view.kind !== "list") {
    const submission = view.kind === "import" ? view.submission : null;
    const from = submission ? clients.find((c) => c.id === submission.client_id)?.name : null;
    return (
      <EntryEditor
        key={view.kind === "edit" ? view.item.id : (submission?.id ?? "add")}
        item={view.kind === "edit" ? view.item : undefined}
        items={items}
        initialOwner={view.kind === "add" ? view.owner : (submission?.client_id ?? undefined)}
        initialProject={submission?.project_id ?? null}
        initialCards={submission?.accounts}
        heading={submission ? `From ${from ?? "a client"} — review and save` : undefined}
        clients={clients}
        projects={projects}
        dataKey={dataKey}
        onClose={async (saved) => {
          setView({ kind: "list" });
          if (!saved) return;
          // Once it's in the vault, the portal copy is wiped (status stays).
          if (submission) {
            const res = await markSubmissionImported(submission.id);
            if ("error" in res && res.error) setError(`Saved to the vault, but the submission couldn't be cleared: ${res.error}`);
            await loadPortal().catch(() => {});
          }
          await reload(dataKey).catch(() => setError("Saved — but the list couldn't refresh. Reload the page."));
        }}
      />
    );
  }

  // ── Unlocked list ────────────────────────────────────────────
  const regenerateRecovery = async () => {
    if (!dkRawRef.current) return setError("Lock and unlock the vault again first, then generate a recovery key.");
    if (!window.confirm("Generate a new recovery key? Your current recovery key will stop working.")) return;
    setError(null);
    setBusy(true);
    try {
      const { recoveryKey, wrapped_dk_recovery, wrapped_dk_recovery_iv } = await rewrapRecovery(dkRawRef.current);
      const res = await updateVaultRecovery({ wrapped_dk_recovery, wrapped_dk_recovery_iv });
      if (res?.error) throw new Error(res.error);
      setNewRecoveryKey(recoveryKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a recovery key.");
    } finally {
      setBusy(false);
    }
  };

  const changeMaster = async (current: string, next: string): Promise<string | null> => {
    if (!dkRawRef.current) return "Lock and unlock the vault again first.";
    const fresh = await getVaultMeta();
    if (!fresh) return "The vault couldn't be found.";
    try {
      await unlockWithPassword(fresh, current);
    } catch {
      return "Your current master password is wrong.";
    }
    const res = await updateVaultMaster(await rewrapMaster(dkRawRef.current, next));
    return res?.error ?? null;
  };

  const markTold = async (toMark: Item[]): Promise<string | null> => {
    const now = new Date().toISOString();
    for (const item of toMark) {
      const encrypted = await encryptSecret(dataKey, { ...item.secret, clientNotifiedAt: now });
      const res = await updateVaultEntry(item.id, { client_id: item.client_id, project_id: item.project_id, ...encrypted });
      if ("error" in res && res.error) return res.error;
    }
    await reload(dataKey);
    return null;
  };

  const attentionCount = items.filter((i) => i.broken || securityIssues(i.secret).length > 0).length;
  const notifyClient = notify ? clients.find((c) => c.id === notify.clientId) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts, clients, usernames…"
            aria-label="Search the vault"
            className={`${inputClasses} pl-10`}
          />
        </div>
        <button onClick={() => setView({ kind: "add", owner: "" })} className={buttonStyles.primary}>
          <Plus className="size-4" aria-hidden />
          Add accounts
        </button>
        {portalReady && (
          <button onClick={() => setRequesting("")} className={buttonStyles.secondary} title="Ask a client for accounts through their portal">
            <Send className="size-4" aria-hidden />
            Request accounts
          </button>
        )}
        <button onClick={() => setChangingMaster(true)} className={buttonStyles.secondary} title="Change your master password">
          <KeyRound className="size-4" aria-hidden />
          Master password
        </button>
        <button onClick={regenerateRecovery} disabled={busy} className={buttonStyles.secondary} title="Generate a new recovery key to save">
          <RefreshCw className="size-4" aria-hidden />
          Recovery key
        </button>
        <button onClick={lock} className={buttonStyles.secondary}>
          <Lock className="size-4" aria-hidden />
          Lock
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Filter">
        {[
          { on: false, label: `All (${items.length})` },
          { on: true, label: `Needs attention (${attentionCount})` },
        ].map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setAttentionOnly(f.on)}
            aria-pressed={attentionOnly === f.on}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-small transition-colors cursor-pointer",
              attentionOnly === f.on ? "border-ink bg-ink text-cloud" : "border-ink/20 text-ink-muted hover:text-ink hover:border-ink/40"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {inbox.length > 0 && (
        <Card className="p-4 md:p-5 mb-5 border-citrus/60">
          <p className="flex items-center gap-2 font-medium">
            <Inbox className="size-4" aria-hidden />
            From the client portal ({inbox.length})
          </p>
          <ul className="mt-3 divide-y divide-ink/5">
            {inbox.map((s) => {
              const client = clients.find((c) => c.id === s.client_id)?.name ?? "A client";
              const project = projects.find((p) => p.id === s.project_id)?.name;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {client}
                      {project && <span className="font-normal text-ink-muted"> · {project}</span>}
                    </span>
                    <span className="block text-small text-ink-muted">
                      {s.broken
                        ? "This one couldn't be opened."
                        : `${s.accounts.length} account${s.accounts.length === 1 ? "" : "s"}: ${s.accounts.map(platformLabel).join(", ")}`}{" "}
                      · sent {formatDate(s.created_at)}
                    </span>
                  </span>
                  <span className="ml-auto flex gap-2">
                    {!s.broken && (
                      <button type="button" onClick={() => setView({ kind: "import", submission: s })} className={buttonStyles.primary}>
                        Review and save
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm("Discard this submission without saving it? The client will see it as secured.")) return;
                        await markSubmissionImported(s.id);
                        await loadPortal();
                      }}
                      className={buttonStyles.secondary}
                    >
                      Discard
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <VaultList
        items={items}
        clients={clients}
        projects={projects}
        search={search}
        attentionOnly={attentionOnly}
        onOpen={(item) => setView({ kind: "edit", item })}
        onAdd={(owner) => setView({ kind: "add", owner })}
        onTellClient={(clientId, pending) => setNotify({ clientId, items: pending })}
        requests={requests}
        onRequest={portalReady ? (clientId) => setRequesting(clientId) : undefined}
      />

      {requesting !== null && (
        <RequestModal
          clients={clients}
          projects={projects}
          requests={requests}
          initialClientId={requesting}
          onClose={() => setRequesting(null)}
          onChanged={loadPortal}
        />
      )}

      {newRecoveryKey && <RecoveryKeyModal recoveryKey={newRecoveryKey} onClose={() => setNewRecoveryKey(null)} />}
      {changingMaster && <ChangeMasterModal onChange={changeMaster} onClose={() => setChangingMaster(false)} />}
      {notify && notifyClient && (
        <NotifyClientModal
          client={notifyClient}
          items={notify.items}
          projects={projects}
          onClose={() => setNotify(null)}
          onMarkTold={markTold}
        />
      )}
    </>
  );
}
