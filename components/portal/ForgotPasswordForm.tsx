"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, MailCheck } from "lucide-react";
import { Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { requestPortalPasswordReset } from "@/lib/portal/actions";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await requestPortalPasswordReset(email);
    setLoading(false);
    if ("error" in res && res.error) setError(res.error);
    else setSent(true);
  };

  if (sent) {
    return (
      <div className="text-small">
        <p className="flex items-center gap-2 font-medium">
          <MailCheck className="size-4 text-forest" aria-hidden />
          Check your inbox
        </p>
        <p className="text-ink-muted mt-2">
          If that email has portal access, a reset link is on its way. It works once — use the newest email if you get
          more than one.
        </p>
        <Link href="/portal/login" className="inline-block mt-4 underline underline-offset-2 decoration-citrus decoration-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="forgot-email">
        <input
          id="forgot-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClasses}
        />
      </Field>
      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" disabled={loading} className={`${buttonStyles.primary} w-full`}>
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Send reset link
      </button>
      <p className="text-center">
        <Link href="/portal/login" className="text-small text-ink-muted hover:text-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
