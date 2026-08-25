"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

export default function ResendAgreementButton({
  onResend,
}: {
  onResend: () => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const resend = () => {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await onResend();
      if (result?.error) setError(result.error);
      else setSent(true);
    });
  };

  return (
    <div>
      <button onClick={resend} disabled={pending} className={buttonStyles.secondary}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="size-4" aria-hidden />
        )}
        Resend
      </button>
      {sent && !pending && <p className="text-small text-green-700 mt-2">Sent.</p>}
      {error && <p className="text-small text-red-700 mt-2">{error}</p>}
    </div>
  );
}
