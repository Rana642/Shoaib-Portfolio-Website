"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Lock,
  LockOpen,
  Plus,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  LoaderCircle,
  KeyRound,
  ShieldCheck,
  X,
  RefreshCw,
} from "lucide-react";
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
  setupVaultMeta,
  updateVaultMaster,
  updateVaultRecovery,
  listVaultEntries,
  createVaultEntry,
  updateVaultEntry,
  deleteVaultEntry,
} from "@/lib/dashboard/actions/vault";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { Client, VaultEntry, VaultMeta, VaultSecret } from "@/lib/dashboard/types";

const AUTO_LOCK_MS = 10 * 60 * 1000; // 10 minutes idle

type Item = {
  id: string;
  client_id: string | null;
  title: string;
  service: string | null;
  secret: VaultSecret;
};

type Draft = {
  id: string | null;
  client_id: string;
  title: string;
  service: string;
  secret: VaultSecret;
};

const emptyDraft: Draft = {
  id: null,
  client_id: "",
  title: "",
  service: "",
  secret: {},
};

function generatePassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
  const arr = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export default function VaultApp({
  meta,
  entries,
  clients,
}: {
  meta: VaultMeta | null;
  entries: VaultEntry[];
  clients: Client[];
}) {
  const [dataKey, setDataKey] = useState<CryptoKey | null>(null);
  const dkRawRef = useRef<Uint8Array | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  // A freshly-minted recovery key, held only long enough to show it once.
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? null;

  const decryptAll = useCallback(async (key: CryptoKey, rows: VaultEntry[]) => {
    const out: Item[] = [];
    for (const r of rows) {
      try {
        const secret = await decryptSecret<VaultSecret>(key, r.ciphertext, r.iv);
        out.push({ id: r.id, client_id: r.client_id, title: r.title, service: r.service, secret });
      } catch {
        out.push({ id: r.id, client_id: r.client_id, title: r.title, service: r.service, secret: {} });
      }
    }
    setItems(out);
  }, []);

  const reload = useCallback(
    async (key: CryptoKey) => {
      const rows = await listVaultEntries();
      await decryptAll(key, rows);
    },
    [decryptAll]
  );

  const lock = useCallback(() => {
    setDataKey(null);
    dkRawRef.current = null;
    setItems([]);
    setDraft(null);
    setNewRecoveryKey(null);
  }, []);

  // Auto-lock after idle.
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

  const visible = items
    .filter((i) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.service ?? "").toLowerCase().includes(q) ||
        (clientName(i.client_id) ?? "").toLowerCase().includes(q) ||
        (i.secret.username ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // ── Locked / setup / unlock screens ──────────────────────────
  if (!dataKey) {
    return meta ? (
      <UnlockScreen
        onUnlock={async (pw) => {
          setError(null);
          setBusy(true);
          try {
            const { dataKey: key, dkRaw } = await unlockWithPassword(meta, pw);
            dkRawRef.current = dkRaw;
            await decryptAll(key, entries);
            setDataKey(key);
          } catch {
            setError("Wrong master password.");
          } finally {
            setBusy(false);
          }
        }}
        onRecover={async (recoveryKey, newPw) => {
          setError(null);
          setBusy(true);
          try {
            const { dataKey: key, dkRaw } = await unlockWithRecovery(meta, recoveryKey);
            const rewrapped = await rewrapMaster(dkRaw, newPw);
            const res = await updateVaultMaster(rewrapped);
            if (res?.error) throw new Error(res.error);
            dkRawRef.current = dkRaw;
            await decryptAll(key, entries);
            setDataKey(key);
          } catch {
            setError("That recovery key didn't work.");
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
        error={error}
      />
    ) : (
      <SetupScreen
        busy={busy}
        error={error}
        onSetup={async (pw) => {
          setError(null);
          setBusy(true);
          try {
            const { meta: m, dataKey: key, recoveryKey } = await setupVault(pw);
            const res = await setupVaultMeta(m);
            if (res?.error) throw new Error(res.error);
            dkRawRef.current = null;
            setDataKey(key);
            return recoveryKey; // shown once by the setup screen
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

  // ── Unlocked vault ───────────────────────────────────────────
  const saveDraft = async () => {
    if (!draft || !dataKey) return;
    if (!draft.title.trim()) {
      setError("Give this entry a title.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { ciphertext, iv } = await encryptSecret(dataKey, draft.secret);
      const input = {
        client_id: draft.client_id || null,
        title: draft.title.trim(),
        service: draft.service.trim() || null,
        ciphertext,
        iv,
      };
      const res = draft.id ? await updateVaultEntry(draft.id, input) : await createVaultEntry(input);
      if (res?.error) throw new Error(res.error);
      await reload(dataKey);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (id: string) => {
    if (!dataKey) return;
    setBusy(true);
    try {
      await deleteVaultEntry(id);
      await reload(dataKey);
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  // Mint a new recovery key from the unlocked data key. Needs dkRaw, which we
  // only hold after a password/recovery unlock (not after first setup — but
  // setup already handed out a recovery key).
  const regenerateRecovery = async () => {
    if (!dkRawRef.current) {
      setError("Re-unlock with your master password first, then generate a recovery key.");
      return;
    }
    if (!window.confirm("Generate a new recovery key? Any previous recovery key will stop working.")) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { recoveryKey, wrapped_dk_recovery, wrapped_dk_recovery_iv } = await rewrapRecovery(
        dkRawRef.current
      );
      const res = await updateVaultRecovery({ wrapped_dk_recovery, wrapped_dk_recovery_iv });
      if (res?.error) throw new Error(res.error);
      setNewRecoveryKey(recoveryKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a recovery key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 text-ink-subtle absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault…"
            className={`${inputClasses} pl-10`}
          />
        </div>
        <button onClick={() => setDraft({ ...emptyDraft })} className={buttonStyles.primary}>
          <Plus className="size-4" aria-hidden />
          Add
        </button>
        <button
          onClick={regenerateRecovery}
          disabled={busy}
          title="Generate a new recovery key to save"
          className={buttonStyles.secondary}
        >
          <RefreshCw className="size-4" aria-hidden />
          Recovery key
        </button>
        <button onClick={lock} className={buttonStyles.secondary}>
          <Lock className="size-4" aria-hidden />
          Lock
        </button>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center">
          <ShieldCheck className="size-8 text-ink-subtle mx-auto mb-3" aria-hidden />
          <p className="text-body-lg font-medium">Your vault is empty</p>
          <p className="text-small text-ink-muted mt-1">Add a client credential to get started.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-ink/5">
            {visible.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() =>
                    setDraft({
                      id: i.id,
                      client_id: i.client_id ?? "",
                      title: i.title,
                      service: i.service ?? "",
                      secret: { ...i.secret },
                    })
                  }
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-ink/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-center size-9 rounded-lg bg-ink/[0.06] shrink-0">
                    <KeyRound className="size-4 text-ink-muted" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{i.title}</p>
                    <p className="text-small text-ink-muted truncate">
                      {i.secret.username || i.service || "—"}
                    </p>
                  </div>
                  {clientName(i.client_id) && (
                    <span className="text-small text-cobalt hidden sm:block truncate max-w-[160px]">
                      {clientName(i.client_id)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">
          {error}
        </p>
      )}

      {draft && (
        <EntryModal
          draft={draft}
          setDraft={setDraft}
          clients={clients}
          onSave={saveDraft}
          onDelete={draft.id ? () => removeEntry(draft.id!) : undefined}
          busy={busy}
        />
      )}

      {newRecoveryKey && (
        <RecoveryKeyModal recoveryKey={newRecoveryKey} onClose={() => setNewRecoveryKey(null)} />
      )}
    </>
  );
}

// ── New recovery key (shown once) ──────────────────────────────
function RecoveryKeyModal({ recoveryKey, onClose }: { recoveryKey: string; onClose: () => void }) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <Card className="p-8 max-w-xl w-full">
        <div className="inline-flex size-11 items-center justify-center rounded-full bg-citrus/20 text-ink mb-4">
          <KeyRound className="size-5" aria-hidden />
        </div>
        <h2 className="text-body-lg font-semibold">Your new recovery key</h2>
        <p className="text-small text-ink-muted mt-2">
          This replaces any previous recovery key — the old one no longer works. It&apos;s the{" "}
          <strong>only</strong> way back in if you forget your master password. Store it somewhere
          safe and offline; it is shown once and never again.
        </p>
        <div className="mt-4 rounded-lg border border-ink/15 bg-ink/[0.03] p-4 font-mono text-small break-all select-all">
          {recoveryKey}
        </div>
        <div className="mt-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(recoveryKey).catch(() => {});
              setCopied(true);
            }}
            className={buttonStyles.secondary}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <label className="flex items-center gap-2.5 mt-5 cursor-pointer">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="size-4 accent-citrus cursor-pointer"
          />
          <span className="text-small">I&apos;ve saved my recovery key somewhere safe.</span>
        </label>
        <button onClick={onClose} disabled={!ack} className={`${buttonStyles.primary} mt-5`}>
          Done
        </button>
      </Card>
    </div>
  );
}

// ── Setup ──────────────────────────────────────────────────────
function SetupScreen({
  onSetup,
  busy,
  error,
}: {
  onSetup: (pw: string) => Promise<string | null>;
  busy: boolean;
  error: string | null;
}) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = async () => {
    setLocalErr(null);
    // This one password protects every client credential, so hold it to a
    // higher bar than a normal login — length is the strongest lever.
    if (pw.length < 12) return setLocalErr("Use at least 12 characters — a passphrase works well.");
    if (pw !== confirm) return setLocalErr("Passwords don't match.");
    const rk = await onSetup(pw);
    if (rk) setRecoveryKey(rk);
  };

  if (recoveryKey) {
    return (
      <Card className="p-8 max-w-xl">
        <div className="inline-flex size-11 items-center justify-center rounded-full bg-citrus/20 text-ink mb-4">
          <KeyRound className="size-5" aria-hidden />
        </div>
        <h2 className="text-body-lg font-semibold">Save your recovery key</h2>
        <p className="text-small text-ink-muted mt-2">
          This is the <strong>only</strong> way back in if you forget your master password. Store it
          somewhere safe and offline — it is shown once and never again.
        </p>
        <div className="mt-4 rounded-lg border border-ink/15 bg-ink/[0.03] p-4 font-mono text-small break-all select-all">
          {recoveryKey}
        </div>
        <div className="mt-3 flex gap-3">
          <button
            onClick={() => navigator.clipboard.writeText(recoveryKey).catch(() => {})}
            className={buttonStyles.secondary}
          >
            <Copy className="size-4" aria-hidden />
            Copy
          </button>
        </div>
        <label className="flex items-center gap-2.5 mt-5 cursor-pointer">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="size-4 accent-citrus cursor-pointer"
          />
          <span className="text-small">I&apos;ve saved my recovery key somewhere safe.</span>
        </label>
        <button
          onClick={() => window.location.reload()}
          disabled={!ack}
          className={`${buttonStyles.primary} mt-5`}
        >
          Open my vault
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-8 max-w-md">
      <div className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-cloud mb-4">
        <ShieldCheck className="size-5" aria-hidden />
      </div>
      <h2 className="text-body-lg font-semibold">Set up your vault</h2>
      <p className="text-small text-ink-muted mt-2 mb-6">
        Choose a strong master password (at least 12 characters — a passphrase is ideal). It&apos;s
        never sent anywhere and can&apos;t be reset — everything is encrypted with it in your browser.
      </p>
      <div className="space-y-4">
        <Field label="Master password" htmlFor="mp">
          <input id="mp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputClasses} />
        </Field>
        <Field label="Confirm master password" htmlFor="mpc">
          <input id="mpc" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClasses} />
        </Field>
      </div>
      {(localErr || error) && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">
          {localErr || error}
        </p>
      )}
      <button onClick={submit} disabled={busy} className={`${buttonStyles.primary} mt-5`}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Create vault
      </button>
    </Card>
  );
}

// ── Unlock ─────────────────────────────────────────────────────
function UnlockScreen({
  onUnlock,
  onRecover,
  busy,
  error,
}: {
  onUnlock: (pw: string) => Promise<void>;
  onRecover: (recoveryKey: string, newPw: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}) {
  const [pw, setPw] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [rk, setRk] = useState("");
  const [newPw, setNewPw] = useState("");

  return (
    <Card className="p-8 max-w-md">
      <div className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-cloud mb-4">
        <Lock className="size-5" aria-hidden />
      </div>
      <h2 className="text-body-lg font-semibold">Vault locked</h2>
      <p className="text-small text-ink-muted mt-2 mb-6">Enter your master password to unlock.</p>

      {recovering ? (
        <div className="space-y-4">
          <Field label="Recovery key" htmlFor="rk">
            <textarea id="rk" rows={2} value={rk} onChange={(e) => setRk(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="New master password" htmlFor="npw">
            <input id="npw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputClasses} />
          </Field>
          <div className="flex gap-3">
            <button onClick={() => onRecover(rk, newPw)} disabled={busy} className={buttonStyles.primary}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Reset &amp; unlock
            </button>
            <button onClick={() => setRecovering(false)} className={buttonStyles.secondary}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onUnlock(pw);
            }}
            placeholder="Master password"
            className={inputClasses}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button onClick={() => onUnlock(pw)} disabled={busy} className={buttonStyles.primary}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
              Unlock
            </button>
            <button onClick={() => setRecovering(true)} className="text-small text-ink-muted hover:text-ink transition-colors">
              Use recovery key
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4">
          {error}
        </p>
      )}
    </Card>
  );
}

// ── Entry add/edit modal ───────────────────────────────────────
function EntryModal({
  draft,
  setDraft,
  clients,
  onSave,
  onDelete,
  busy,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  clients: Client[];
  onSave: () => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const s = draft.secret;
  const setS = (patch: Partial<VaultSecret>) => setDraft({ ...draft, secret: { ...draft.secret, ...patch } });

  const copy = (label: string, value?: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyBtn = (label: string, value?: string) =>
    value ? (
      <button type="button" onClick={() => copy(label, value)} className="text-ink-subtle hover:text-ink transition-colors" aria-label={`Copy ${label}`}>
        {copied === label ? <Check className="size-4 text-green-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 backdrop-blur-sm p-4 py-10">
      <Card className="p-6 w-full max-w-lg" variant="solid">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-body-lg font-semibold">{draft.id ? "Edit entry" : "New entry"}</h2>
          <button onClick={() => setDraft(null)} aria-label="Close" className="text-ink-subtle hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title" htmlFor="v_title">
              <input id="v_title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClasses} />
            </Field>
            <Field label="Service" htmlFor="v_service" hint="e.g. Google Ads">
              <input id="v_service" value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value })} className={inputClasses} />
            </Field>
          </div>

          <Field label="Client" htmlFor="v_client">
            <select id="v_client" value={draft.client_id} onChange={(e) => setDraft({ ...draft, client_id: e.target.value })} className={inputClasses}>
              <option value="">Not linked</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Username / email" htmlFor="v_user">
            <div className="flex items-center gap-2">
              <input id="v_user" value={s.username ?? ""} onChange={(e) => setS({ username: e.target.value })} className={inputClasses} />
              {copyBtn("username", s.username)}
            </div>
          </Field>

          <Field label="Password" htmlFor="v_pass">
            <div className="flex items-center gap-2">
              <input
                id="v_pass"
                type={reveal ? "text" : "password"}
                value={s.password ?? ""}
                onChange={(e) => setS({ password: e.target.value })}
                className={`${inputClasses} font-mono`}
              />
              <button type="button" onClick={() => setReveal((r) => !r)} className="text-ink-subtle hover:text-ink" aria-label="Reveal">
                {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
              <button type="button" onClick={() => setS({ password: generatePassword() })} className="text-ink-subtle hover:text-ink" aria-label="Generate">
                <RefreshCw className="size-4" aria-hidden />
              </button>
              {copyBtn("password", s.password)}
            </div>
          </Field>

          <Field label="2FA / TOTP secret" htmlFor="v_totp">
            <div className="flex items-center gap-2">
              <input id="v_totp" value={s.totp ?? ""} onChange={(e) => setS({ totp: e.target.value })} className={`${inputClasses} font-mono`} />
              {copyBtn("totp", s.totp)}
            </div>
          </Field>

          <Field label="Backup / recovery codes" htmlFor="v_codes" hint="One per line.">
            <textarea id="v_codes" rows={3} value={s.backupCodes ?? ""} onChange={(e) => setS({ backupCodes: e.target.value })} className={`${inputClasses} font-mono`} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Recovery email" htmlFor="v_remail">
              <input id="v_remail" value={s.recoveryEmail ?? ""} onChange={(e) => setS({ recoveryEmail: e.target.value })} className={inputClasses} />
            </Field>
            <Field label="Recovery phone" htmlFor="v_rphone">
              <input id="v_rphone" value={s.recoveryPhone ?? ""} onChange={(e) => setS({ recoveryPhone: e.target.value })} className={inputClasses} />
            </Field>
          </div>

          <Field label="Security questions" htmlFor="v_qa">
            <textarea id="v_qa" rows={2} value={s.securityQa ?? ""} onChange={(e) => setS({ securityQa: e.target.value })} className={inputClasses} />
          </Field>

          <Field label="URL" htmlFor="v_url">
            <input id="v_url" value={s.url ?? ""} onChange={(e) => setS({ url: e.target.value })} className={inputClasses} />
          </Field>

          <Field label="Notes" htmlFor="v_notes">
            <textarea id="v_notes" rows={2} value={s.notes ?? ""} onChange={(e) => setS({ notes: e.target.value })} className={inputClasses} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-ink/10">
          <div>
            {onDelete && (
              <button onClick={onDelete} disabled={busy} className={buttonStyles.danger}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setDraft(null)} className={buttonStyles.secondary}>
              Cancel
            </button>
            <button onClick={onSave} disabled={busy} className={buttonStyles.primary}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Save
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
