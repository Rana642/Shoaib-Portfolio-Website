"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Lock, Plus, ShieldCheck } from "lucide-react";
import { Card, buttonStyles } from "@/components/dashboard/ui";
import AccountCard, { type CardDraft } from "@/components/dashboard/vault/AccountCard";
import { sealForVault } from "@/lib/vault-crypto";
import { submitAccounts } from "@/lib/portal/accounts";
import {
  defaultTitle,
  emptySecret,
  requestKeyOf,
  secretForRequestKey,
  withIdentity,
  type RequestKey,
  type VaultSecret,
} from "@/lib/vault-platforms";
import type { AccessIdentities } from "@/lib/access-identities";
import { cn } from "@/lib/utils";

// Card ids are local to this form (the vault gives entries real ids on
// import) — deterministic for the first render so SSR and hydration agree.
const draftFor = (id: string, secret: VaultSecret, chosen: boolean): CardDraft => ({
  id,
  isNew: true,
  secret,
  original: null,
  chosen,
  titleTouched: false,
});

/**
 * The client's side of sending logins: the same per-platform cards as the
 * vault, sealed in this browser to the vault's public key before anything
 * is sent (lib/vault-crypto.ts sealForVault). The client can't read it back
 * — only Shoaib's unlocked vault can open it.
 */
export default function SendAccountsForm({
  projectId,
  where,
  publicKey,
  requested,
  identities,
}: {
  projectId: string | null;
  /** Project (or client) name, used to title the entries. */
  where: string;
  publicKey: string;
  /** What I've asked for here — pre-added as cards. */
  requested: RequestKey[];
  /** Shoaib's accounts, for the "give me access" steps. */
  identities: AccessIdentities;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<CardDraft[]>(() =>
    requested.length
      ? requested.map((key, i) => draftFor(`requested-${i}`, withIdentity(secretForRequestKey(key), identities), true))
      : [draftFor("first", emptySecret("other"), false)]
  );
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  // Don't lose typed-in logins to an accidental tab close.
  useEffect(() => {
    if (!dirty || sent !== null) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, sent]);

  const update = (id: string, patch: Partial<CardDraft>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  };

  const send = async () => {
    setError(null);
    const ready = cards.filter((c) => c.chosen);
    if (ready.length === 0) return setError("Pick a platform for at least one account.");
    setSending(true);
    try {
      // Only what the client typed — nothing that means something in the
      // vault (links, history, ownership) comes from here.
      const accounts: VaultSecret[] = ready.map((c) => ({
        ...c.secret,
        own: false,
        title: defaultTitle(where, c.secret),
        links: {},
        passwordHistory: [],
        passwordChangedAt: null,
        clientNotifiedAt: null,
      }));
      const sealed = await sealForVault(publicKey, { v: 1, accounts });
      const platforms = [...new Set(accounts.map(requestKeyOf))];
      const res = await submitAccounts({ projectId, platforms, ...sealed });
      if ("error" in res && res.error) throw new Error(res.error);
      setSent(accounts.length);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent !== null) {
    return (
      <Card variant="solid" className="p-6 md:p-8 mt-8 max-w-xl">
        <ShieldCheck className="size-8 text-forest mb-3" aria-hidden />
        <p className="text-body-lg font-semibold">
          {sent} account{sent === 1 ? "" : "s"} sent securely
        </p>
        <p className="text-small text-ink-muted mt-2">
          Thank you — I&apos;ve been notified. I&apos;ll check each account, add 2-step protection where it&apos;s missing, and
          mark it secured on your portal.
        </p>
        <Link href="/portal" className={cn(buttonStyles.primary, "mt-5")}>
          Back to my portal
        </Link>
      </Card>
    );
  }

  const readyCount = cards.filter((c) => c.chosen).length;

  return (
    <div className="mt-8">
      <div className="space-y-4">
        {cards.map((c) => (
          <AccountCard
            key={c.id}
            draft={c}
            title=""
            portal
            identities={identities}
            gmails={[]}
            usedBy={[]}
            onChange={(patch) => update(c.id, patch)}
            onRemove={
              cards.length > 1
                ? () => {
                    setCards((prev) => prev.filter((x) => x.id !== c.id));
                    setDirty(true);
                  }
                : undefined
            }
          />
        ))}
      </div>

      <button type="button" onClick={() => setCards((prev) => [...prev, draftFor(`added-${Date.now()}`, emptySecret("other"), false)])} className={cn(buttonStyles.secondary, "mt-4")}>
        <Plus className="size-4" aria-hidden />
        Add another account
      </button>

      <Card variant="solid" className="sticky bottom-4 z-20 mt-6 p-3 md:p-4">
        {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-small text-ink-muted mr-auto">
            <Lock className="size-4" aria-hidden />
            Locked on this device before sending
          </p>
          <button type="button" onClick={send} disabled={sending} className={buttonStyles.primary}>
            {sending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {readyCount > 1 ? `Send ${readyCount} accounts` : "Send securely"}
          </button>
        </div>
      </Card>
    </div>
  );
}
