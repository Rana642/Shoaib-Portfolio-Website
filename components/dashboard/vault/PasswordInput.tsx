"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, RefreshCw, WandSparkles } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import {
  DEFAULT_GENERATOR,
  generatePassword,
  passwordStrength,
  type GeneratorOptions,
  type Strength,
} from "@/lib/password-generator";
import { cn } from "@/lib/utils";
import { CopyButton, InputActions, actionPad, iconButton, useDismiss } from "./shared";

/** A secret field: masked by default, with show / generate / copy, and a
 *  strength meter under it. autoComplete="new-password" stops the browser
 *  from filling in (or offering to save) Shoaib's own logins here. */
export default function PasswordInput({
  id,
  label,
  value,
  onChange,
  showStrength = true,
  generator = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showStrength?: boolean;
  generator?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  const [generating, setGenerating] = useState(false);

  return (
    <div className="relative">
      <div className="relative">
        <input
          id={id}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          className={cn(inputClasses, "font-mono", actionPad(generator ? 3 : 2))}
        />
        <InputActions>
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            title={reveal ? "Hide" : "Show"}
            aria-label={reveal ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className={iconButton}
          >
            {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
          {generator && (
            <button
              type="button"
              onClick={() => setGenerating((g) => !g)}
              title="Generate a strong password"
              aria-label="Generate a strong password"
              aria-expanded={generating}
              className={cn(iconButton, generating && "bg-ink/5 text-ink")}
            >
              <WandSparkles className="size-4" aria-hidden />
            </button>
          )}
          <CopyButton value={value} label={label} />
        </InputActions>
      </div>
      {showStrength && value && <StrengthMeter strength={passwordStrength(value)} />}
      {generating && (
        <Generator
          onUse={(pw) => {
            onChange(pw);
            setReveal(true);
            setGenerating(false);
          }}
          onClose={() => setGenerating(false)}
        />
      )}
    </div>
  );
}

const METER_COLORS = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-forest", "bg-forest"];

export function StrengthMeter({ strength }: { strength: Strength }) {
  return (
    <div className="flex items-center gap-2 mt-1.5" aria-label={`Password strength: ${strength.label}`}>
      <div className="flex gap-1 flex-1 max-w-40">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={cn("h-1 flex-1 rounded-full", strength.score >= n ? METER_COLORS[strength.score] : "bg-ink/10")}
          />
        ))}
      </div>
      <span className="text-xs text-ink-muted">{strength.label}</span>
    </div>
  );
}

function Generator({ onUse, onClose }: { onUse: (pw: string) => void; onClose: () => void }) {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [pw, setPw] = useState(() => generatePassword(DEFAULT_GENERATOR));
  const panelRef = useRef<HTMLDivElement>(null);
  useDismiss(panelRef, onClose);

  const update = (patch: Partial<GeneratorOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    setPw(generatePassword(next));
  };

  const toggles: { key: keyof GeneratorOptions; label: string }[] = [
    { key: "upper", label: "A–Z" },
    { key: "lower", label: "a–z" },
    { key: "digits", label: "0–9" },
    { key: "symbols", label: "!@#$" },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 z-30 w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-ink/10 bg-white p-4 shadow-[0_12px_32px_-12px_rgba(15,15,20,0.3)]"
    >
      <p className="text-small font-medium mb-2">Strong password</p>
      <div className="flex items-start gap-1 rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2">
        <span className="flex-1 font-mono text-small break-all select-all">{pw}</span>
        <button
          type="button"
          onClick={() => setPw(generatePassword(options))}
          title="Another one"
          aria-label="Generate another"
          className={cn(iconButton, "size-7 -my-0.5")}
        >
          <RefreshCw className="size-3.5" aria-hidden />
        </button>
      </div>
      <StrengthMeter strength={passwordStrength(pw)} />

      <label className="flex items-center gap-3 mt-4 text-small">
        <span className="w-14 shrink-0">Length</span>
        <input
          type="range"
          min={12}
          max={64}
          step={1}
          value={options.length}
          onChange={(e) => update({ length: Number(e.target.value) })}
          className="flex-1 accent-ink"
        />
        <span className="w-6 text-right font-mono">{options.length}</span>
      </label>

      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
        {toggles.map(({ key, label }) => (
          <label key={key} className="inline-flex items-center gap-1.5 text-small cursor-pointer">
            <input
              type="checkbox"
              checked={options[key] as boolean}
              onChange={(e) => update({ [key]: e.target.checked })}
              className="size-4 accent-citrus cursor-pointer"
            />
            <span className="font-mono">{label}</span>
          </label>
        ))}
        <label className="inline-flex items-center gap-1.5 text-small cursor-pointer">
          <input
            type="checkbox"
            checked={options.avoidAmbiguous}
            onChange={(e) => update({ avoidAmbiguous: e.target.checked })}
            className="size-4 accent-citrus cursor-pointer"
          />
          Skip look-alikes (O/0, l/1)
        </label>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className={buttonStyles.secondary}>
          Cancel
        </button>
        <button type="button" onClick={() => onUse(pw)} className={buttonStyles.primary}>
          Use password
        </button>
      </div>
    </div>
  );
}
