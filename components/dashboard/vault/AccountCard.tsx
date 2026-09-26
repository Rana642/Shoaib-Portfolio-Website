"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Eye, EyeOff, History, Lock, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Card, Field, inputClasses, labelClasses } from "@/components/dashboard/ui";
import {
  ISSUE_LABELS,
  PLATFORMS,
  TWO_STEP_METHODS,
  getPlatform,
  securityIssues,
  type FieldDef,
  type PlatformId,
  type TwoStep,
  type VaultSecret,
} from "@/lib/vault-platforms";
import { formatDate } from "@/lib/dashboard/format";
import { cn } from "@/lib/utils";
import PasswordInput from "./PasswordInput";
import { CopyButton, InputActions, PlatformIcon, actionPad, iconButton, safeHref } from "./shared";

/** One account being added or edited. `chosen` is false until a platform
 *  is picked; `original` is the saved version (null for a new account), used
 *  to spot password changes on save. */
export type CardDraft = {
  key: string;
  id: string | null;
  secret: VaultSecret;
  original: VaultSecret | null;
  chosen: boolean;
  titleTouched: boolean;
};

export default function AccountCard({
  draft,
  title,
  onChange,
  onRemove,
}: {
  draft: CardDraft;
  /** What the title field shows — the auto title until it's been edited. */
  title: string;
  onChange: (patch: Partial<CardDraft>) => void;
  onRemove?: () => void;
}) {
  const { secret } = draft;
  const [changingPlatform, setChangingPlatform] = useState(false);
  const setSecret = (patch: Partial<VaultSecret>) => onChange({ secret: { ...secret, ...patch } });
  const setField = (id: string, value: string) => setSecret({ fields: { ...secret.fields, [id]: value } });
  const setTwoStep = (patch: Partial<TwoStep>) => setSecret({ twoStep: { ...secret.twoStep, ...patch } });
  const idp = `acc-${draft.key}`;

  const pick = (platform: PlatformId) => {
    // Field values carry over where the new platform has the same field.
    onChange({ secret: { ...secret, platform }, chosen: true });
    setChangingPlatform(false);
  };

  if (!draft.chosen || changingPlatform) {
    return (
      <Card variant="solid" className="p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="font-medium">Which platform is this account on?</p>
          {changingPlatform ? (
            <button type="button" onClick={() => setChangingPlatform(false)} className={iconButton} aria-label="Keep the current platform">
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            onRemove && (
              <button type="button" onClick={onRemove} className={iconButton} aria-label="Remove this account">
                <X className="size-4" aria-hidden />
              </button>
            )
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-small transition-colors cursor-pointer",
                draft.chosen && secret.platform === p.id
                  ? "border-ink bg-ink/5"
                  : "border-ink/15 hover:border-ink/40 hover:bg-ink/[0.03]"
              )}
            >
              <PlatformIcon platform={p.id} className="shrink-0 text-ink-muted" />
              <span className="leading-tight">{p.label}</span>
            </button>
          ))}
        </div>
      </Card>
    );
  }

  const platform = getPlatform(secret.platform);
  const issues = securityIssues(secret).filter((i) => i !== "client_not_told");

  return (
    <Card variant="solid" className="p-4 md:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <span className="flex items-center justify-center size-9 rounded-lg bg-ink/[0.06]">
          <PlatformIcon platform={platform.id} />
        </span>
        <div className="mr-auto">
          <p className="font-medium leading-tight">{platform.label}</p>
          <button
            type="button"
            onClick={() => setChangingPlatform(true)}
            className="text-xs text-ink-subtle hover:text-ink underline underline-offset-2 cursor-pointer"
          >
            Change platform
          </button>
        </div>
        {issues.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-forest">
            <ShieldCheck className="size-3.5" aria-hidden />
            Secure
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {issues.map((i) => (
              <span key={i} className="text-xs rounded-full px-2 py-0.5 bg-amber-500/10 text-amber-800 border border-amber-600/20">
                {ISSUE_LABELS[i]}
              </span>
            ))}
          </span>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className={iconButton} aria-label="Remove this account">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {platform.note && <p className="text-small text-ink-muted mb-4">{platform.note}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Title" htmlFor={`${idp}-title`}>
            <input
              id={`${idp}-title`}
              value={title}
              maxLength={200}
              onChange={(e) => onChange({ secret: { ...secret, title: e.target.value }, titleTouched: true })}
              className={inputClasses}
            />
          </Field>
        </div>

        {platform.fields.map((field) => (
          <FieldInput
            key={field.id}
            id={`${idp}-${field.id}`}
            field={field}
            value={secret.fields[field.id] ?? ""}
            onChange={(v) => setField(field.id, v)}
          />
        ))}
      </div>

      <CustomFields idp={idp} secret={secret} setSecret={setSecret} />

      {platform.signIn && (
        <section className="mt-5 pt-4 border-t border-ink/10">
          <p className="font-medium mb-3">2-step verification and recovery</p>
          <label className="inline-flex items-center gap-2.5 text-small cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={secret.twoStep.enabled}
              onChange={(e) => setTwoStep({ enabled: e.target.checked })}
              className="size-4 accent-citrus cursor-pointer"
            />
            2-step verification is on (authenticator app, SMS or key)
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {secret.twoStep.enabled && (
              <>
                <Field label="Method" htmlFor={`${idp}-method`}>
                  <select
                    id={`${idp}-method`}
                    value={secret.twoStep.method}
                    onChange={(e) => setTwoStep({ method: e.target.value })}
                    className={inputClasses}
                  >
                    <option value="">Choose…</option>
                    {TWO_STEP_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="On which phone / device" htmlFor={`${idp}-device`}>
                  <input
                    id={`${idp}-device`}
                    value={secret.twoStep.device}
                    placeholder="Shoaib's iPhone"
                    onChange={(e) => setTwoStep({ device: e.target.value })}
                    className={inputClasses}
                  />
                </Field>
              </>
            )}
            <PlainInput id={`${idp}-remail`} label="Recovery email" kind="email" value={secret.twoStep.recoveryEmail} onChange={(v) => setTwoStep({ recoveryEmail: v })} />
            <PlainInput id={`${idp}-rphone`} label="Recovery phone" kind="phone" value={secret.twoStep.recoveryPhone} onChange={(v) => setTwoStep({ recoveryPhone: v })} />
            <PlainInput id={`${idp}-whatsapp`} label="WhatsApp number" kind="phone" value={secret.twoStep.whatsapp} onChange={(v) => setTwoStep({ whatsapp: v })} />

            {secret.twoStep.enabled && (
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label htmlFor={`${idp}-codes`} className={labelClasses}>
                    Backup codes
                  </label>
                  <CopyButton value={secret.twoStep.backupCodes} label="Backup codes" />
                </div>
                <textarea
                  id={`${idp}-codes`}
                  rows={4}
                  value={secret.twoStep.backupCodes}
                  onChange={(e) => setTwoStep({ backupCodes: e.target.value })}
                  spellCheck={false}
                  className={cn(inputClasses, "font-mono")}
                />
                <p className="text-small text-ink-subtle mt-1.5">One code per line — delete a code once it&apos;s been used.</p>
              </div>
            )}
          </div>

          <details className="group mt-4">
            <summary className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink cursor-pointer list-none">
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              More: authenticator secret key, security questions
            </summary>
            <div className="grid grid-cols-1 gap-4 mt-3">
              <Field label="Authenticator secret key" htmlFor={`${idp}-totp`} hint="The setup key shown when the authenticator was added.">
                <PasswordInput
                  id={`${idp}-totp`}
                  label="Secret key"
                  value={secret.twoStep.secretKey}
                  onChange={(v) => setTwoStep({ secretKey: v })}
                  showStrength={false}
                  generator={false}
                />
              </Field>
              <Field label="Security questions" htmlFor={`${idp}-qa`}>
                <textarea
                  id={`${idp}-qa`}
                  rows={2}
                  value={secret.twoStep.securityQa}
                  onChange={(e) => setTwoStep({ securityQa: e.target.value })}
                  className={inputClasses}
                />
              </Field>
            </div>
          </details>
        </section>
      )}

      <div className="mt-5 pt-4 border-t border-ink/10">
        <Field label="Notes" htmlFor={`${idp}-notes`}>
          <textarea
            id={`${idp}-notes`}
            rows={2}
            value={secret.notes}
            onChange={(e) => setSecret({ notes: e.target.value })}
            className={inputClasses}
          />
        </Field>
      </div>

      {secret.passwordHistory.length > 0 && <PasswordHistory secret={secret} />}
    </Card>
  );
}

function FieldInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.kind === "secret") {
    return (
      <Field label={field.label} htmlFor={id}>
        <PasswordInput id={id} label={field.label} value={value} onChange={onChange} />
      </Field>
    );
  }
  if (field.kind === "multiline") {
    return (
      <div className="sm:col-span-2">
        <Field label={field.label} htmlFor={id}>
          <textarea
            id={id}
            rows={2}
            value={value}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClasses}
          />
        </Field>
      </div>
    );
  }
  return <PlainInput id={id} label={field.label} kind={field.kind} placeholder={field.placeholder} value={value} onChange={onChange} />;
}

const INPUT_MODE: Partial<Record<FieldDef["kind"], React.HTMLAttributes<HTMLInputElement>["inputMode"]>> = {
  email: "email",
  phone: "tel",
  url: "url",
};

function PlainInput({
  id,
  label,
  kind,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  kind: FieldDef["kind"];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const href = kind === "url" ? safeHref(value) : null;
  const actions = kind === "date" ? 0 : kind === "url" ? 2 : 1;
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          type={kind === "date" ? "date" : "text"}
          inputMode={INPUT_MODE[kind]}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClasses, actionPad(actions))}
        />
        {actions > 0 && (
          <InputActions>
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" title="Open link" aria-label={`Open ${label.toLowerCase()}`} className={iconButton}>
                <ExternalLink className="size-4" aria-hidden />
              </a>
            )}
            <CopyButton value={value} label={label} />
          </InputActions>
        )}
      </div>
    </Field>
  );
}

function CustomFields({
  idp,
  secret,
  setSecret,
}: {
  idp: string;
  secret: VaultSecret;
  setSecret: (patch: Partial<VaultSecret>) => void;
}) {
  const update = (i: number, patch: Partial<VaultSecret["custom"][number]>) =>
    setSecret({ custom: secret.custom.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div className="mt-4 space-y-3">
      {secret.custom.map((c, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-start">
          <input
            aria-label="Field name"
            placeholder="Field name"
            value={c.label}
            onChange={(e) => update(i, { label: e.target.value })}
            className={inputClasses}
          />
          {c.secret ? (
            <PasswordInput id={`${idp}-custom-${i}`} label={c.label || "Value"} value={c.value} onChange={(v) => update(i, { value: v })} showStrength={false} />
          ) : (
            <div className="relative">
              <input
                aria-label={`${c.label || "Field"} value`}
                placeholder="Value"
                value={c.value}
                autoComplete="off"
                onChange={(e) => update(i, { value: e.target.value })}
                className={cn(inputClasses, actionPad(1))}
              />
              <InputActions>
                <CopyButton value={c.value} label={c.label || "value"} />
              </InputActions>
            </div>
          )}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => update(i, { secret: !c.secret })}
              title={c.secret ? "Show as plain text" : "Hide like a password"}
              aria-label={c.secret ? "Show as plain text" : "Hide like a password"}
              aria-pressed={c.secret}
              className={cn(iconButton, c.secret && "text-ink bg-ink/5")}
            >
              <Lock className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setSecret({ custom: secret.custom.filter((_, j) => j !== i) })}
              aria-label="Remove field"
              className={iconButton}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setSecret({ custom: [...secret.custom, { label: "", value: "", secret: false }] })}
        className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink cursor-pointer"
      >
        <Plus className="size-4" aria-hidden />
        Add a field
      </button>
    </div>
  );
}

function PasswordHistory({ secret }: { secret: VaultSecret }) {
  const [shown, setShown] = useState<number | null>(null);
  const platform = getPlatform(secret.platform);
  const fieldLabel = (id: string) => platform.fields.find((f) => f.id === id)?.label ?? id;

  return (
    <details className="group mt-4">
      <summary className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink cursor-pointer list-none">
        <History className="size-4" aria-hidden />
        Previous passwords ({secret.passwordHistory.length})
      </summary>
      <ul className="mt-3 divide-y divide-ink/5 rounded-lg border border-ink/10">
        {secret.passwordHistory.map((h, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-small">
            <span className="text-ink-muted">{fieldLabel(h.field)}</span>
            <span className="text-ink-subtle">changed {formatDate(h.changedAt)}</span>
            <span className="ml-auto font-mono">{shown === i ? h.value : "••••••••"}</span>
            <button
              type="button"
              onClick={() => setShown(shown === i ? null : i)}
              aria-label={shown === i ? "Hide" : "Show"}
              className={cn(iconButton, "size-8")}
            >
              {shown === i ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
            <CopyButton value={h.value} label="Old password" />
          </li>
        ))}
      </ul>
    </details>
  );
}
