"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { hostinger } from "@/lib/hostinger";

/** Click-to-copy coupon chip. Falls back silently if the clipboard API
 *  is blocked — the code is plainly visible either way. */
export default function CouponCode({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hostinger.coupon);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the visible code still works */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy coupon code ${hostinger.coupon}`}
      className={`group inline-flex items-center gap-3 rounded-xl border-2 border-dashed border-ink/30 bg-white px-5 py-3 font-mono text-body-lg font-semibold tracking-widest transition-colors hover:border-citrus ${className}`}
    >
      {hostinger.coupon}
      <span className="inline-flex items-center gap-1.5 text-small font-sans font-normal tracking-normal text-ink-subtle group-hover:text-ink">
        {copied ? (
          <>
            <Check className="size-4 text-green-600" aria-hidden />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-4" aria-hidden />
            Copy
          </>
        )}
      </span>
    </button>
  );
}
