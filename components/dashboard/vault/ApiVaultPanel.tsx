"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { listCredentials } from "@/lib/dashboard/actions/api-vault";
import { Card, buttonStyles } from "@/components/dashboard/ui";
import AddCredentialButton from "@/components/dashboard/api-vault/AddCredentialButton";
import CredentialsList from "@/components/dashboard/api-vault/CredentialsList";

type Listed = Awaited<ReturnType<typeof listCredentials>>;

/**
 * The API Vault, inside the unlocked Password Vault (Shoaib, 2026-10-20 —
 * "filhal master password k ander"). Its keys are still encrypted with the
 * server key (API_VAULT_ENCRYPTION_KEY), not the master password: the crons,
 * the MCP server and every integration decrypt them on the server. The
 * master password decides when this screen opens — the list is only loaded
 * after unlock and is dropped with everything else on lock.
 */
export default function ApiVaultPanel({ ready, onLock }: { ready: boolean; onLock: () => void }) {
  const [credentials, setCredentials] = useState<Listed | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCredentials(await listCredentials());
      setError(null);
    } catch {
      setError("The API Vault couldn't be loaded. Check your connection and try again.");
    }
  }, []);

  // First load on open; `load` handles refreshes after a change.
  useEffect(() => {
    let cancelled = false;
    listCredentials()
      .then((rows) => !cancelled && setCredentials(rows))
      .catch(() => !cancelled && setError("The API Vault couldn't be loaded. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="flex-1 min-w-[240px] text-small text-ink-muted">
          API keys for Google Ads, Meta, GA4, GTM, Search Console, Google Business, WhatsApp and more. These stay
          readable by the server, because the crons and the MCP tools use them.
        </p>
        {ready && <AddCredentialButton onSaved={load} />}
        <button onClick={onLock} className={buttonStyles.secondary}>
          <Lock className="size-4" aria-hidden />
          Lock
        </button>
      </div>

      {!ready && (
        <Card className="p-4 mb-6 border-citrus/40 bg-citrus/10">
          <p className="text-small">
            <strong>API_VAULT_ENCRYPTION_KEY</strong> isn&apos;t set on the server yet — the API Vault can&apos;t
            encrypt or decrypt anything until it is. Add it to <code>.env.local</code> and to Vercel&apos;s environment
            variables, then redeploy.
          </p>
        </Card>
      )}

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mb-4">{error}</p>
      )}

      {credentials === null ? (
        !error && (
          <p className="text-small text-ink-muted flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading API keys…
          </p>
        )
      ) : (
        <CredentialsList credentials={credentials} onChanged={load} />
      )}
    </>
  );
}
