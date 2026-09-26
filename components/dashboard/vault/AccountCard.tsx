"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  History,
  Link2,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
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
import {
  CopyButton,
  InputActions,
  PlatformIcon,
  actionPad,
  iconButton,
  safeHref,
  useDismiss,
  type GmailOption,
} from "./shared";

/** One account being added or edited. `id` is the entry's id — generated
 *  in the browser for a new one (`isNew`), so accounts added together can
 *  link to each other before anything is saved. `chosen` is false until a
 *  platform is picked; `original` is the saved version, used to spot
 *  password changes on save. */
export type CardDraft = {
  id: string;
  isNew: boolean;
  secret: VaultSecret;
  original: VaultSecret | null;
  chosen: boolean;
  titleTouched: boolean;
};

export default function AccountCard({
  draft,
  title,
  gmails,
  usedBy,
  onChange,
  onRemove,
  hideTitle = false,
}: {
  draft: CardDraft;
  /** What the title field shows — the auto title until it's been edited. */
  title: string;
  /** The client portal names entries automatically — no title field there. */
  hideTitle?: boolean;
  /** Gmails of the same client/own vault that sign-in fields can link to. */
  gmails: GmailOption[];
  /** For a Gmail: titles of the accounts that sign in with it. */
  usedBy: string[];
  onChange: (patch: Partial<CardDraft>) => void;
  onRemove?: () => void;
}) {
  const { secret } = draft;
  const [changingPlatform, setChangingPlatform] = useState(false);
  const setSecret = (patch: Partial<VaultSecret>) => onChange({ secret: { ...secret, ...patch } });
  const setField = (id: string, value: string) => setSecret({ fields: { ...secret.fields, [id]: value } });
  const setTwoStep = (patch: Partial<TwoStep>) => setSecret({ twoStep: { ...secret.twoStep, ...patch } });
  const setLink = (fieldId: string, gmail: GmailOption | null) => {
    const links = { ...secret.links };
    if (gmail) links[fieldId] = gmail.id;
    else delete links[fieldId];
    setSecret({ links, fields: { ...secret.fields, [fieldId]: gmail?.email ?? secret.fields[fieldId] ?? "" } });
  };
  const idp = `acc-${draft.id}`;

  // Field values carry over where the new platform has the same field.
  const pick = (platform: PlatformId, master = false) => {
    onChange({ secret: { ...secret, platform, master }, chosen: true });
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
          {/* The client's main Google account gets its own tile, first —
              it's a Gmail entry with the master flag already ticked. */}
          <button
            type="button"
            onClick={() => pick("google_account", true)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-small transition-colors cursor-pointer",
              draft.chosen && secret.master
                ? "border-ink bg-citrus/25"
                : "border-citrus/60 bg-citrus/10 hover:bg-citrus/20"
            )}
          >
            <Crown className="size-4 shrink-0" aria-hidden />
            <span className="leading-tight font-medium">Master Gmail</span>
          </button>
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-small transition-colors cursor-pointer",
                draft.chosen && secret.platform === p.id && !secret.master
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
        <span className={cn("flex items-center justify-center size-9 rounded-lg", secret.master ? "bg-citrus/25" : "bg-ink/[0.06]")}>
          {secret.master ? <Crown className="size-4" aria-hidden /> : <PlatformIcon platform={platform.id} />}
        </span>
        <div className="mr-auto">
          <p className="font-medium leading-tight">{secret.master ? "Master Gmail" : platform.label}</p>
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

      {platform.id === "google_account" && (
        <div className="mb-4 rounded-lg border border-citrus/50 bg-citrus/10 px-3.5 py-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={secret.master}
              onChange={(e) => setSecret({ master: e.target.checked })}
              className="size-4 mt-0.5 accent-citrus cursor-pointer"
            />
            <span>
              <span className="text-small font-medium">Master Gmail</span>
              <span className="block text-small text-ink-muted">
                The main Google account this business runs on — other accounts sign in with it. Needs 2-step, backup codes and
                both recovery email and phone.
              </span>
            </span>
          </label>
          {usedBy.length > 0 && (
            <div className="mt-3 pl-6.5">
              <p className="text-xs text-ink-muted mb-1.5">
                {usedBy.length} account{usedBy.length === 1 ? " signs" : "s sign"} in with this Gmail:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {usedBy.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs rounded-full border border-ink/15 bg-white px-2 py-0.5">
                    <Link2 className="size-3" aria-hidden />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!hideTitle && (
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
        )}

        {platform.fields.map((field) => {
          const linked = field.linkable ? gmails.find((g) => g.id === secret.links[field.id]) : undefined;
          return field.linkable && (gmails.length > 0 || linked) ? (
            <LinkableInput
              key={field.id}
              id={`${idp}-${field.id}`}
              field={field}
              value={secret.fields[field.id] ?? ""}
              linked={linked}
              gmails={gmails}
              onChange={(v) => setField(field.id, v)}
              onLink={(g) => setLink(field.id, g)}
            />
          ) : (
            <FieldInput
              key={field.id}
              id={`${idp}-${field.id}`}
              field={field}
              value={secret.fields[field.id] ?? ""}
              onChange={(v) => setField(field.id, v)}
            />
          );
        })}
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

/**
 * A sign-in email that can be linked to a Gmail saved in the vault. Linked,
 * it shows that Gmail's current address (read-only) — so renaming the Gmail
 * entry updates every account that signs in with it. Unlinked, it's a plain
 * field with a picker for the client's Gmails, master ones first.
 */
function LinkableInput({
  id,
  field,
  value,
  linked,
  gmails,
  onChange,
  onLink,
}: {
  id: string;
  field: FieldDef;
  value: string;
  linked: GmailOption | undefined;
  gmails: GmailOption[];
  onChange: (value: string) => void;
  onLink: (gmail: GmailOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  return (
    <Field label={field.label} htmlFor={id}>
      <div className="relative" ref={menuRef}>
        {linked ? (
          <>
            <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
              {linked.master ? <Crown className="size-4 text-amber-700" aria-hidden /> : <Link2 className="size-4 text-ink-subtle" aria-hidden />}
            </span>
            <input id={id} value={linked.email} readOnly className={cn(inputClasses, "pl-9 bg-ink/[0.03]", actionPad(2))} />
            <InputActions>
              <CopyButton value={linked.email} label={field.label} />
              <button type="button" onClick={() => onLink(null)} title="Unlink — type a different login" aria-label="Unlink this Gmail" className={iconButton}>
                <Unlink className="size-4" aria-hidden />
              </button>
            </InputActions>
          </>
        ) : (
          <>
            <input
              id={id}
              value={value}
              placeholder={field.placeholder}
              inputMode={field.kind === "email" ? "email" : undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
              className={cn(inputClasses, actionPad(2))}
            />
            <InputActions>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                title="Pick a saved Gmail"
                aria-label="Pick a saved Gmail"
                aria-expanded={open}
                className={cn(iconButton, open && "bg-ink/5 text-ink")}
              >
                <Crown className="size-4" aria-hidden />
              </button>
              <CopyButton value={value} label={field.label} />
            </InputActions>
          </>
        )}
        {open && !linked && (
          <GmailMenu
            gmails={gmails}
            anchor={menuRef}
            onPick={(g) => {
              onLink(g);
              close();
            }}
            onClose={close}
          />
        )}
      </div>
      {linked && (
        <p className="text-xs text-ink-subtle mt-1.5">
          Signs in with the {linked.master ? "master Gmail" : "Gmail"} of {linked.where}
        </p>
      )}
    </Field>
  );
}

function GmailMenu({
  gmails,
  anchor,
  onPick,
  onClose,
}: {
  gmails: GmailOption[];
  anchor: React.RefObject<HTMLDivElement | null>;
  onPick: (gmail: GmailOption) => void;
  onClose: () => void;
}) {
  useDismiss(anchor, onClose);
  return (
    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-xl border border-ink/10 bg-white p-1.5 shadow-[0_12px_32px_-12px_rgba(15,15,20,0.3)]">
      <p className="px-2.5 pt-1.5 pb-1 text-xs text-ink-subtle">Sign in with a saved Gmail</p>
      {gmails.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onPick(g)}
          className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-ink/5 cursor-pointer"
        >
          {g.master ? <Crown className="size-4 shrink-0 text-amber-700" aria-hidden /> : <Link2 className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
          <span className="min-w-0">
            <span className="block text-small truncate">{g.email}</span>
            <span className="block text-xs text-ink-subtle truncate">
              {g.master ? "Master Gmail" : "Gmail"} · {g.where}
            </span>
          </span>
        </button>
      ))}
    </div>
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
