import { Landmark } from "lucide-react";
import CopyValue from "./CopyValue";
import type { PaymentBlock } from "@/lib/payment-accounts";

/** The bank account(s) to pay into, each detail with a Copy button. */
export default function HowToPay({ blocks, note, title = "How to pay" }: { blocks: PaymentBlock[]; note?: string; title?: string }) {
  if (!blocks.length) {
    return (
      <div className="rounded-xl border border-ink/10 bg-white p-6">
        <h2 className="text-body-lg font-semibold">{title}</h2>
        <p className="text-small text-ink-muted mt-2">
          Please message me on WhatsApp at <a href="https://wa.me/923017461642" className="underline underline-offset-4">+92 301 7461642</a> for the payment details.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-6">
      <div className="flex items-center gap-2.5">
        <Landmark className="size-5 text-cobalt" aria-hidden />
        <h2 className="text-body-lg font-semibold">{title}</h2>
      </div>
      <p className="text-small text-ink-muted mt-1.5">Bank transfer to my business account:</p>
      <div className={`mt-5 grid gap-6 ${blocks.length > 1 ? "md:grid-cols-2" : ""}`}>
        {blocks.map((block) => (
          <div key={block.key}>
            {blocks.length > 1 && (
              <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle mb-3">{block.heading}</p>
            )}
            <dl className="space-y-3">
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
          </div>
        ))}
      </div>
      {note && <p className="text-small text-ink-muted mt-5 whitespace-pre-line">{note}</p>}
    </div>
  );
}
