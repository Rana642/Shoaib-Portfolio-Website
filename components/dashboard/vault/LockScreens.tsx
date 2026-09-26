"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Lock, LockOpen, ShieldCheck, X } from "lucide-react";
import { Card, Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { iconButton } from "./shared";

// This one password protects every credential in the vault, so it's held to
// a higher bar than a normal login — length is the strongest lever.
const MIN_MASTER = 12;

/** Checks a new master password + its confirmation; returns an error or null. */
function checkNewMaster(pw: string, confirm: string): string | null {
  if (pw.length < MIN_MASTER) return `Use at least ${MIN_MASTER} characters — a passphrase works well.`;
  if (pw !== confirm) return "The two passwords don't match.";
  return null;
}

const errorBox = "text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4";

// ── First-time setup ───────────────────────────────────────────
export function SetupScreen({
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
  const [localErr, setLocalErr] = useState<string | null>(null);

  const submit = async () => {
    const problem = checkNewMaster(pw, confirm);
    setLocalErr(problem);
    if (problem) return;
    const rk = await onSetup(pw);
    if (rk) setRecoveryKey(rk);
  };

  if (recoveryKey) {
    return (
      <Card className="p-8 max-w-xl">
        <RecoveryKeyBody
          title="Save your recovery key"
          intro="This is the only way back in if you forget your master password. Store it somewhere safe and offline — it is shown once and never again."
          recoveryKey={recoveryKey}
          doneLabel="Open my vault"
          onDone={() => window.location.reload()}
        />
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
        Choose a strong master password (at least {MIN_MASTER} characters — a passphrase is ideal). It&apos;s never sent
        anywhere and can&apos;t be reset — everything is encrypted with it in your browser.
      </p>
      <div className="space-y-4">
        <Field label="Master password" htmlFor="mp">
          <input id="mp" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputClasses} />
        </Field>
        <Field label="Confirm master password" htmlFor="mpc">
          <input id="mpc" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClasses} />
        </Field>
      </div>
      {(localErr || error) && <p className={errorBox}>{localErr || error}</p>}
      <button onClick={submit} disabled={busy} className={`${buttonStyles.primary} mt-5`}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Create vault
      </button>
    </Card>
  );
}

// ── Unlock / recovery reset ────────────────────────────────────
export function UnlockScreen({
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
  const [confirm, setConfirm] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);

  const recover = () => {
    const problem = rk.trim() ? checkNewMaster(newPw, confirm) : "Paste your recovery key.";
    setLocalErr(problem);
    if (!problem) onRecover(rk, newPw);
  };

  return (
    <Card className="p-8 max-w-md">
      <div className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-cloud mb-4">
        <Lock className="size-5" aria-hidden />
      </div>
      <h2 className="text-body-lg font-semibold">{recovering ? "Reset with your recovery key" : "Vault locked"}</h2>
      <p className="text-small text-ink-muted mt-2 mb-6">
        {recovering
          ? "Your recovery key unlocks the vault once, and you choose a new master password."
          : "Enter your master password to unlock."}
      </p>

      {recovering ? (
        <div className="space-y-4">
          <Field label="Recovery key" htmlFor="rk">
            <textarea id="rk" rows={2} value={rk} onChange={(e) => setRk(e.target.value)} spellCheck={false} className={`${inputClasses} font-mono`} />
          </Field>
          <Field label="New master password" htmlFor="npw">
            <input id="npw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputClasses} />
          </Field>
          <Field label="Confirm new master password" htmlFor="npwc">
            <input id="npwc" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClasses} />
          </Field>
          <div className="flex gap-3">
            <button onClick={recover} disabled={busy} className={buttonStyles.primary}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Reset &amp; unlock
            </button>
            <button
              onClick={() => {
                setRecovering(false);
                setLocalErr(null);
              }}
              className={buttonStyles.secondary}
            >
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
            aria-label="Master password"
            autoComplete="current-password"
            className={inputClasses}
            autoFocus
          />
          <div className="flex items-center gap-3">
            <button onClick={() => onUnlock(pw)} disabled={busy} className={buttonStyles.primary}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
              Unlock
            </button>
            <button onClick={() => setRecovering(true)} className="text-small text-ink-muted hover:text-ink transition-colors cursor-pointer">
              Use recovery key
            </button>
          </div>
        </div>
      )}

      {(localErr || error) && <p className={errorBox}>{localErr || error}</p>}
    </Card>
  );
}

// ── Recovery key, shown once ───────────────────────────────────
function RecoveryKeyBody({
  title,
  intro,
  recoveryKey,
  doneLabel,
  onDone,
}: {
  title: string;
  intro: string;
  recoveryKey: string;
  doneLabel: string;
  onDone: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="inline-flex size-11 items-center justify-center rounded-full bg-citrus/20 text-ink mb-4">
        <KeyRound className="size-5" aria-hidden />
      </div>
      <h2 className="text-body-lg font-semibold">{title}</h2>
      <p className="text-small text-ink-muted mt-2">{intro}</p>
      <div className="mt-4 rounded-lg border border-ink/15 bg-ink/[0.03] p-4 font-mono text-small break-all select-all">{recoveryKey}</div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(recoveryKey).catch(() => {});
          setCopied(true);
        }}
        className={`${buttonStyles.secondary} mt-3`}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
      <label className="flex items-center gap-2.5 mt-5 cursor-pointer">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-citrus cursor-pointer" />
        <span className="text-small">I&apos;ve saved my recovery key somewhere safe.</span>
      </label>
      <button onClick={onDone} disabled={!ack} className={`${buttonStyles.primary} mt-5`}>
        {doneLabel}
      </button>
    </>
  );
}

export function RecoveryKeyModal({ recoveryKey, onClose }: { recoveryKey: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <Card variant="solid" className="p-8 max-w-xl w-full">
        <RecoveryKeyBody
          title="Your new recovery key"
          intro="This replaces any previous recovery key — the old one no longer works. It's the only way back in if you forget your master password. Store it somewhere safe and offline; it is shown once and never again."
          recoveryKey={recoveryKey}
          doneLabel="Done"
          onDone={onClose}
        />
      </Card>
    </div>
  );
}

// ── Change master password (while unlocked) ────────────────────
export function ChangeMasterModal({
  onChange,
  onClose,
}: {
  /** Verifies `current`, then re-wraps under `next`. Returns an error or null. */
  onChange: (current: string, next: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const problem = !current ? "Enter your current master password." : checkNewMaster(next, confirm);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const err = await onChange(current, next);
    setBusy(false);
    if (err) setError(err);
    else setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <Card variant="solid" className="p-8 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-body-lg font-semibold">Change master password</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={iconButton}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {done ? (
          <>
            <p className="flex items-center gap-2 text-small">
              <Check className="size-4 text-forest" aria-hidden />
              Master password changed. Your recovery key still works.
            </p>
            <button onClick={onClose} className={`${buttonStyles.primary} mt-5`}>
              Done
            </button>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <Field label="Current master password" htmlFor="cmp">
                <input id="cmp" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="New master password" htmlFor="nmp">
                <input id="nmp" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClasses} />
              </Field>
              <Field label="Confirm new master password" htmlFor="nmpc">
                <input id="nmpc" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClasses} />
              </Field>
            </div>
            {error && <p className={errorBox}>{error}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className={buttonStyles.secondary}>
                Cancel
              </button>
              <button onClick={submit} disabled={busy} className={buttonStyles.primary}>
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Change password
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
