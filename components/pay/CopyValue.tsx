"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A bank detail with a one-tap Copy button (account numbers are easy to mistype). */
export default function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — the value is still selectable */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-2 py-1 text-tag font-medium text-ink-muted hover:text-ink hover:border-ink/30 transition-colors print:hidden"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="size-3.5 text-green-700" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
