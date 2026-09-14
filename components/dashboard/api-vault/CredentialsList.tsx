"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Check, Pencil, Trash2, LoaderCircle, Power } from "lucide-react";
import {
  revealCredential,
  deleteCredential,
  setCredentialActive,
} from "@/lib/dashboard/actions/api-vault";
import { Card, EmptyState, buttonStyles } from "@/components/dashboard/ui";
import { API_SERVICE_PRESETS, type ApiCredential } from "@/lib/dashboard/types";
import CredentialModal from "./CredentialModal";

type ListedCredential = Omit<ApiCredential, "fields"> & { fieldNames: string[] };

function serviceLabel(value: string): string {
  return API_SERVICE_PRESETS.find((p) => p.value === value)?.label ?? value;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy value"
      className="text-ink-subtle hover:text-ink transition-colors p-1"
    >
      {copied ? <Check className="size-3.5 text-green-700" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

function CredentialCard({ cred }: { cred: ListedCredential }) {
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; value: string }[] | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleReveal = async () => {
    if (revealed) {
      setRevealed(null);
      return;
    }
    setRevealError(null);
    setRevealing(true);
    const result = await revealCredential(cred.id);
    setRevealing(false);
    if ("error" in result) setRevealError(result.error);
    else setRevealed(result);
  };

  const onDelete = () => {
    if (!confirm(`Delete "${cred.label}"? This can't be undone.`)) return;
    setBusy(true);
    startTransition(async () => {
      await deleteCredential(cred.id);
      setBusy(false);
    });
  };

  return (
    <>
      <Card className={`p-5 ${!cred.is_active ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">{cred.label}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
                {serviceLabel(cred.service)}
              </span>
              {!cred.is_active && (
                <span className="text-tag text-ink-subtle border border-ink/15 rounded-full px-2 py-0.5">Inactive</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                startTransition(() => {
                  void setCredentialActive(cred.id, !cred.is_active);
                })
              }
              aria-label={cred.is_active ? "Mark inactive" : "Mark active"}
              title={cred.is_active ? "Mark inactive" : "Mark active"}
              className="text-ink-subtle hover:text-ink transition-colors p-1.5"
            >
              <Power className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${cred.label}`}
              className="text-ink-subtle hover:text-ink transition-colors p-1.5"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label={`Delete ${cred.label}`}
              className="text-ink-subtle hover:text-red-700 transition-colors p-1.5"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          {cred.fieldNames.length === 0 ? (
            <p className="text-small text-ink-subtle">No fields saved.</p>
          ) : (
            cred.fieldNames.map((name) => {
              const rv = revealed?.find((r) => r.name === name);
              return (
                <div key={name} className="flex items-center gap-2 text-small">
                  <span className="text-ink-subtle font-mono w-32 shrink-0 truncate" title={name}>
                    {name}
                  </span>
                  <span className="font-mono flex-1 truncate">{rv ? rv.value : "••••••••••••"}</span>
                  {rv && <CopyButton text={rv.value} />}
                </div>
              );
            })
          )}
        </div>

        {revealError && <p className="text-small text-red-700 mt-2">{revealError}</p>}

        {cred.notes && <p className="text-small text-ink-muted mt-3 whitespace-pre-wrap">{cred.notes}</p>}

        <div className="mt-4">
          <button
            type="button"
            onClick={toggleReveal}
            disabled={revealing}
            className={`${buttonStyles.secondary} !py-1.5 !px-3 text-small`}
          >
            {revealing ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : revealed ? (
              <EyeOff className="size-3.5" aria-hidden />
            ) : (
              <Eye className="size-3.5" aria-hidden />
            )}
            {revealed ? "Hide values" : "Reveal values"}
          </button>
        </div>
      </Card>

      {editing && <CredentialModal editing={cred} onClose={() => setEditing(false)} />}
    </>
  );
}

export default function CredentialsList({ credentials }: { credentials: ListedCredential[] }) {
  if (credentials.length === 0) {
    return (
      <EmptyState
        title="No API credentials saved yet"
        description="Add Google Ads, Meta Marketing API, GA4, GTM, GSC or Google Business Profile credentials above."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {credentials.map((cred) => (
        <CredentialCard key={cred.id} cred={cred} />
      ))}
    </div>
  );
}
