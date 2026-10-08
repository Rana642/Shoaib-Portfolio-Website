"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Eye, EyeOff, KeyRound, LoaderCircle, Lock } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { createOwnerKeys, openVaultSeal, unlockOwnerKey } from "@/lib/vault-crypto";
import type { OwnerShare } from "@/lib/vault-platforms";
import { createMyVaultKey, getMyVaultKey, listMyVaultShares, resetMyVaultKey } from "@/lib/portal/vault";

type Opened = { id: string; project_id: string | null; share: OwnerShare | null };
const IDLE_MS = 5 * 60 * 1000;

/**
 * The Owner's Passwords tab: set a PIN once, then unlock with it. Copies
 * are decrypted only here, in the browser, and dropped on lock / idle.
 */
type KeyMeta = { wrapped_private_key: string; iv: string; salt: string; iterations: number };

export default function PortalPasswords({ initialKey }: { initialKey: KeyMeta | null }) {
  const [stage, setStage] = useState<"loading" | "setup" | "locked" | "open">(initialKey ? "locked" : "setup");
  const [keyMeta, setKeyMeta] = useState<KeyMeta | null>(initialKey);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Opened[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const lastActive = useRef(0);

  const load = useCallback(async () => {
    const res = await getMyVaultKey();
    if ("error" in res) return setError("Passwords aren't shared with this portal.");
    setKeyMeta(res.key);
    setStage(res.key ? "locked" : "setup");
  }, []);
  const lock = useCallback(() => {
    setItems([]);
    setShown(new Set());
    setPin("");
    setStage("locked");
  }, []);

  // Auto-lock when idle.
  useEffect(() => {
    if (stage !== "open") return;
    lastActive.current = Date.now();
    const bump = () => (lastActive.current = Date.now());
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump));
    const t = setInterval(() => Date.now() - lastActive.current > IDLE_MS && lock(), 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(t);
    };
  }, [stage, lock]);

  const openWith = async (privateKey: CryptoKey) => {
    const res = await listMyVaultShares();
    if ("error" in res) throw new Error("Not available.");
    setProjects(res.projects);
    setItems(
      await Promise.all(
        res.shares.map(async (s) => {
          try {
            return { id: s.entry_id, project_id: s.project_id, share: await openVaultSeal<OwnerShare>(privateKey, s) };
          } catch {
            return { id: s.entry_id, project_id: s.project_id, share: null };
          }
        })
      )
    );
    setStage("open");
  };

  const setup = async () => {
    setError(null);
    if (pin.length < 8) return setError("Use at least 8 characters.");
    if (pin !== pin2) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      const keys = await createOwnerKeys(pin);
      const res = await createMyVaultKey(keys);
      if ("error" in res && res.error) throw new Error(res.error);
      setPin2("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set the PIN.");
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!keyMeta) return;
    setError(null);
    setBusy(true);
    try {
      const privateKey = await unlockOwnerKey(pin, keyMeta);
      await openWith(privateKey);
    } catch {
      setError("Wrong PIN.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!confirm("Reset your PIN? Your saved passwords disappear from here until Ads by Shoaib shares them again.")) return;
    await resetMyVaultKey();
    setPin("");
    await load();
  };

  if (stage === "loading") return <p className="text-small text-ink-muted">{error ?? "Loading…"}</p>;

  if (stage === "setup" || stage === "locked") {
    const isSetup = stage === "setup";
    return (
      <Card className="p-6 max-w-md">
        <p className="flex items-center gap-2 font-medium mb-2">
          <Lock className="size-4" aria-hidden /> {isSetup ? "Create your passwords PIN" : "Unlock your passwords"}
        </p>
        <p className="text-small text-ink-muted mb-4">
          {isSetup
            ? "Your account passwords are locked with a PIN only you know — not even Ads by Shoaib can see it. Use at least 8 characters and keep it safe."
            : "Enter your PIN. Passwords lock again after 5 minutes of no activity."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (isSetup ? setup() : unlock());
          }}
          className="space-y-3"
        >
          <input type="password" autoComplete={isSetup ? "new-password" : "current-password"} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" className={inputClasses} autoFocus />
          {isSetup && (
            <input type="password" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} placeholder="Type the PIN again" className={inputClasses} />
          )}
          {error && <p className="text-small text-red-700">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || !pin} className={buttonStyles.primary}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {isSetup ? "Set PIN" : "Unlock"}
            </button>
            {!isSetup && (
              <button type="button" onClick={forgot} className="text-small underline underline-offset-4 text-ink-muted">
                Forgot PIN?
              </button>
            )}
          </div>
        </form>
      </Card>
    );
  }

  const groups = [...projects, { id: "", name: "General" }]
    .map((p) => ({ ...p, items: items.filter((i) => (i.project_id ?? "") === p.id) }))
    .filter((g) => g.items.length);
  const toggle = (k: string) => setShown((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button type="button" onClick={lock} className={buttonStyles.secondary}>
          <Lock className="size-4" aria-hidden /> Lock
        </button>
      </div>
      {groups.length === 0 && (
        <Card className="p-6">
          <p className="text-small text-ink-muted">Nothing shared yet — passwords appear here once Ads by Shoaib shares them.</p>
        </Card>
      )}
      {groups.map((g) => (
        <section key={g.id || "general"}>
          <h2 className="font-serif italic text-h3 mb-3">{g.name}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {g.items.map((i) => (
              <Card key={i.id} className="p-5">
                {i.share ? (
                  <>
                    <p className="flex items-center gap-2 font-medium">
                      <KeyRound className="size-4 text-ink-subtle" aria-hidden /> {i.share.title}
                    </p>
                    <p className="text-tag text-ink-subtle mb-3">{i.share.platform}</p>
                    <dl className="space-y-2">
                      {i.share.fields.map((f, n) => {
                        const k = `${i.id}:${n}`;
                        const visible = !f.secret || shown.has(k);
                        return (
                          <div key={k} className="text-small">
                            <dt className="text-ink-muted text-tag">{f.label}</dt>
                            <dd className="flex items-center gap-2">
                              <span className="font-mono break-all">{visible ? f.value : "••••••••••"}</span>
                              {f.secret && (
                                <button type="button" onClick={() => toggle(k)} aria-label={visible ? "Hide" : "Show"} className="text-ink-subtle hover:text-ink">
                                  {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(f.value)}
                                aria-label="Copy"
                                className="text-ink-subtle hover:text-ink"
                              >
                                <Copy className="size-4" aria-hidden />
                              </button>
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </>
                ) : (
                  <p className="text-small text-ink-muted">This entry couldn&apos;t be opened. Ask Ads by Shoaib to share it again.</p>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
