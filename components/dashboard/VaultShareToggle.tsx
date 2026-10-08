"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Card } from "@/components/dashboard/ui";
import { setClientVaultShare } from "@/lib/dashboard/actions/vault";

/** Share this client's Password Vault entries with its portal Owner(s). */
export default function VaultShareToggle({ clientId, initial }: { clientId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-6">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            setError(null);
            start(async () => {
              const res = await setClientVaultShare(clientId, next);
              if ("error" in res && res.error) {
                setError(res.error);
                setOn(!next);
              }
            });
          }}
          className="mt-1"
        />
        <span>
          <span className="flex items-center gap-2 font-medium">
            <KeyRound className="size-4" aria-hidden /> Share passwords with the portal Owner
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          </span>
          <span className="block text-small text-ink-muted mt-1">
            Every vault entry of this client&apos;s projects appears in the Owner&apos;s Passwords tab (never for team members), locked
            with a PIN only the Owner knows. Copies are made the next time you unlock the vault. Untick an entry inside the vault
            to keep it back.
          </span>
        </span>
      </label>
      {error && <p className="text-small text-red-700 mt-2">{error}</p>}
    </Card>
  );
}
