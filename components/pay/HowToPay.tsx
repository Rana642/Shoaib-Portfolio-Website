"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import CopyValue from "./CopyValue";
import type { PaymentBlock } from "@/lib/payment-accounts";

const TAB_LABEL: Record<PaymentBlock["key"], string> = { pk: "Pakistan", intl: "International" };

/**
 * The bank account to pay into, each detail with a Copy button. With both a
 * Pakistan and an international account it's one card with a toggle between
 * them (Pakistan first), so the payer only sees the details they need.
 */
export default function HowToPay({ blocks, note, title = "How to pay" }: { blocks: PaymentBlock[]; note?: string; title?: string }) {
  const [tab, setTab] = useState<PaymentBlock["key"]>(blocks[0]?.key ?? "pk");

  if (!blocks.length) {
    return (
      <div className="min-w-0 rounded-xl border border-ink/10 bg-white p-6">
        <h2 className="text-body-lg font-semibold">{title}</h2>
        <p className="text-small text-ink-muted mt-2">
          Please message me on WhatsApp at <a href="https://wa.me/923017461642" className="underline underline-offset-4">+92 301 7461642</a> for the payment details.
        </p>
      </div>
    );
  }

  const block = blocks.find((b) => b.key === tab) ?? blocks[0];
  return (
    <div className="min-w-0 rounded-xl border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Landmark className="size-5 text-cobalt" aria-hidden />
          <h2 className="text-body-lg font-semibold">{title}</h2>
        </div>
        {blocks.length > 1 && (
          <div role="tablist" aria-label="Where you're paying from" className="inline-flex rounded-lg bg-ink/5 p-1">
            {blocks.map((b) => (
              <button
                key={b.key}
                type="button"
                role="tab"
                id={`pay-tab-${b.key}`}
                aria-selected={b.key === block.key}
                aria-controls="pay-tab-panel"
                onClick={() => setTab(b.key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-small transition-colors cursor-pointer",
                  b.key === block.key ? "bg-white font-medium text-ink shadow-sm" : "text-ink-muted hover:text-ink"
                )}
              >
                {TAB_LABEL[b.key]}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-small text-ink-muted mt-1.5">
        {block.key === "intl" ? "International bank transfer to my business account:" : "Bank transfer to my business account:"}
      </p>
      <dl id="pay-tab-panel" role={blocks.length > 1 ? "tabpanel" : undefined} aria-labelledby={blocks.length > 1 ? `pay-tab-${block.key}` : undefined} className="mt-5 space-y-3">
        {block.rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 pb-3 border-b border-ink/5 last:border-0 last:pb-0">
            <div className="min-w-0">
              <dt className="text-tag text-ink-subtle">{row.label}</dt>
              <dd className="text-small font-medium break-all">{row.value}</dd>
            </div>
            {row.copy && <CopyValue value={row.value} label={row.label} />}
          </div>
        ))}
      </dl>
      {note && <p className="text-small text-ink-muted mt-5 whitespace-pre-line">{note}</p>}
    </div>
  );
}
