"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { signAgreement, declineAgreement } from "@/lib/dashboard/actions/agreement-public";
import { Field, inputClasses, buttonStyles } from "@/components/dashboard/ui";

export default function AgreementSignForm({ token, status }: { token: string; status: string }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"signed" | "declined" | null>(null);
  const [pending, startTransition] = useTransition();

  if (status === "signed" || result === "signed") {
    return (
      <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
        <p className="text-body-lg font-medium text-green-700">You&apos;ve signed this agreement.</p>
        <p className="text-small text-ink-muted mt-1">
          Check your email for a link to get onboarded — it should arrive within a couple of
          minutes.
        </p>
      </div>
    );
  }
  if (status === "declined" || result === "declined") {
    return (
      <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
        <p className="text-body-lg font-medium">You&apos;ve declined this agreement.</p>
        <p className="text-small text-ink-muted mt-1">
          If that was a mistake, or you&apos;d like to talk it through, just reply to the email this
          came from.
        </p>
      </div>
    );
  }

  const onSign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError("Please confirm you agree to the terms above.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await signAgreement(token, name);
      if ("error" in res) setError(res.error);
      else setResult("signed");
    });
  };

  const onDecline = () => {
    setError(null);
    startTransition(async () => {
      const res = await declineAgreement(token);
      if (res?.error) setError(res.error);
      else setResult("declined");
    });
  };

  return (
    <div className="mt-10 pt-8 border-t border-ink/10 print:hidden">
      <form onSubmit={onSign} className="space-y-4 max-w-md">
        <p className="font-mono uppercase text-tag tracking-widest text-ink-subtle">
          Sign this agreement
        </p>
        <Field label="Your full name" htmlFor="signerName">
          <input
            id="signerName"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClasses}
          />
        </Field>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="size-4 mt-0.5 accent-citrus cursor-pointer"
          />
          <span className="text-small">
            I have read and agree to the terms above, and typing my name above serves as my
            signature.
          </span>
        </label>

        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="submit" disabled={pending} className={buttonStyles.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Sign agreement
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={pending}
            className={buttonStyles.secondary}
          >
            Decline
          </button>
        </div>
      </form>
    </div>
  );
}
