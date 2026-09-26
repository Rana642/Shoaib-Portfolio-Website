"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Lock, Plus, RefreshCw, Search } from "lucide-react";
import {
  setupVault,
  unlockWithPassword,
  unlockWithRecovery,
  rewrapMaster,
  rewrapRecovery,
  encryptSecret,
  decryptSecret,
} from "@/lib/vault-crypto";
import {
  getVaultMeta,
  setupVaultMeta,
  updateVaultMaster,
  updateVaultRecovery,
  listVaultEntries,
  updateVaultEntry,
} from "@/lib/dashboard/actions/vault";
import { normalizeSecret, securityIssues } from "@/lib/vault-platforms";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { VaultEntry, VaultMeta } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { ChangeMasterModal, RecoveryKeyModal, SetupScreen, UnlockScreen } from "./vault/LockScreens";
import EntryEditor from "./vault/EntryEditor";
import VaultList from "./vault/VaultList";
import NotifyClientModal from "./vault/NotifyClientModal";
import type { Item, VaultClient, VaultProject } from "./vault/shared";

const AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes idle

type View = { kind: "list" } | { kind: "add"; owner: string } | { kind: "edit"; item: Item };

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
  }, []);

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
  const open = async (key: CryptoKey, dkRaw: Uint8Array) => {
    try {
      await reload(key);
    } catch {
      setError("Unlocked, but the entries couldn't be loaded. Check your connection and try again.");
      return;
    }
    dkRawRef.current = dkRaw;
    setDataKey(key);
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
            await open(unlocked.dataKey, unlocked.dkRaw);
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
            await open(unlocked.dataKey, unlocked.dkRaw);
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

  // ── Add / edit ───────────────────────────────────────────────
  if (view.kind !== "list") {
    return (
      <EntryEditor
        key={view.kind === "edit" ? view.item.id : "add"}
        item={view.kind === "edit" ? view.item : undefined}
        initialOwner={view.kind === "add" ? view.owner : undefined}
        clients={clients}
        projects={projects}
        dataKey={dataKey}
        onClose={async (saved) => {
          setView({ kind: "list" });
          if (saved) await reload(dataKey).catch(() => setError("Saved — but the list couldn't refresh. Reload the page."));
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

      <VaultList
        items={items}
        clients={clients}
        projects={projects}
        search={search}
        attentionOnly={attentionOnly}
        onOpen={(item) => setView({ kind: "edit", item })}
        onAdd={(owner) => setView({ kind: "add", owner })}
        onTellClient={(clientId, pending) => setNotify({ clientId, items: pending })}
      />

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
