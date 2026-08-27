"use client";

import { useState, useTransition } from "react";
import { Printer, LoaderCircle, Send } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

export default function AgreementActions({
  status,
  onSend,
}: {
  status: string;
  onSend: () => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const send = () => {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await onSend();
      if (result?.error) setError(result.error);
      else setSent(true);
    });
  };

  const canSend = status !== "signed" && status !== "declined";

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => window.print()} className={buttonStyles.secondary}>
          <Printer className="size-4" aria-hidden />
          Print / PDF
        </button>

        {canSend && (
          <button onClick={send} disabled={pending} className={buttonStyles.primary}>
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {status === "draft" ? "Send to client" : "Resend"}
          </button>
        )}
      </div>

      {sent && !pending && (
        <p className="text-small text-green-700 bg-green-500/10 border border-green-600/20 rounded-lg px-4 py-3 mt-4 max-w-md">
          Sent.
        </p>
      )}
      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-4 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
