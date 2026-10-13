"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { updateAccessIdentities } from "@/lib/dashboard/actions/settings";
import { Field, SettingsCard, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { IDENTITIES, type AccessIdentities } from "@/lib/access-identities";

/** Clients → Setup → My access accounts: what clients add when they give access. */
export default function AccessIdentitiesForm({ identities }: { identities: AccessIdentities }) {
  const [values, setValues] = useState<Record<string, string>>({ ...identities });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateAccessIdentities(values);
      if ("error" in res && res.error) setError(res.error);
      else setSaved(true);
    });
  };

  return (
    <SettingsCard
      title="My access accounts"
      description={
        <>
          The accounts clients add when they give you access. They fill in access grants in the vault, and they&apos;re what
          the client portal tells clients to enter — so nothing here should be secret.
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {IDENTITIES.map((identity) => (
          <Field key={identity.key} label={identity.label} htmlFor={`identity-${identity.key}`} hint={identity.hint}>
            <input
              id={`identity-${identity.key}`}
              value={values[identity.key] ?? ""}
              placeholder={identity.placeholder}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, [identity.key]: e.target.value }));
                setSaved(false);
              }}
              className={inputClasses}
            />
          </Field>
        ))}
      </div>
      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Save access accounts
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-small text-ink-muted">
            <Check className="size-4 text-forest" aria-hidden />
            Saved
          </span>
        )}
      </div>
    </SettingsCard>
  );
}
