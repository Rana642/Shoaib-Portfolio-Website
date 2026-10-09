"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import { Card, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import type { CheckItem } from "@/lib/domain-email-check";

type Result = { domain: string; score: number; items: CheckItem[] } | { error: string };

/** Settings: is a domain's email set up to land in the inbox (MX, SPF, DKIM, DMARC)? */
export default function DomainEmailCheck({
  initialDomain,
  onCheck,
}: {
  initialDomain: string;
  onCheck: (domain: string) => Promise<Result>;
}) {
  const [domain, setDomain] = useState(initialDomain);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => setResult(await onCheck(domain)));

  return (
    <Card className="p-6 mt-8 max-w-3xl">
      <h2 className="text-body-lg font-medium mb-1">Email domain check</h2>
      <p className="text-small text-ink-muted mb-4">
        Checks whether a domain is set up so its emails land in the inbox, not spam — use it for adsbyshoaib.com (invoices, reports) and
        in client audits.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex gap-2"
      >
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className={`${inputClasses} max-w-xs`} />
        <button type="submit" disabled={pending || !domain.trim()} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Check
        </button>
      </form>

      {result && "error" in result && <p className="text-small text-red-700 mt-4">{result.error}</p>}
      {result && "items" in result && (
        <div className="mt-5">
          <p className="text-small mb-3">
            <span className="font-medium">{result.domain}</span> — score{" "}
            <span className={result.score >= 75 ? "text-forest font-medium" : "text-red-700 font-medium"}>{result.score}/100</span>
          </p>
          <ul className="grid gap-3">
            {result.items.map((i) => {
              const Icon = !i.ok ? XCircle : i.warn ? TriangleAlert : CheckCircle2;
              const color = !i.ok ? "text-red-700" : i.warn ? "text-ink" : "text-forest";
              return (
                <li key={i.name} className="flex gap-3 rounded-lg border border-ink/10 p-3">
                  <Icon className={`size-5 shrink-0 mt-0.5 ${color}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-small font-medium">{i.name}</p>
                    <p className="text-small text-ink-muted">{i.advice}</p>
                    {i.value && <p className="text-tag font-mono text-ink-subtle break-all mt-1">{i.value}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
