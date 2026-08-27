"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, CheckCircle2 } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

/**
 * Two-step confirm for real-but-non-destructive side effects (client
 * creation, an email send) triggered outside the normal online flow —
 * same arm/confirm pattern as DeleteButton, styled as an affirmative
 * action rather than a danger one.
 *
 * `emailCheckboxLabel`, when given, adds an opt-in checkbox (unchecked
 * by default) whose value is passed to `action` — the side effect always
 * happens, but the email that would normally go with it only fires if
 * ticked, since Shoaib may be sharing the resulting link himself
 * (WhatsApp, in person) rather than through Resend.
 */
export default function ConfirmActionButton({
  action,
  label,
  confirmLabel = "Click again to confirm",
  emailCheckboxLabel,
}: {
  action: (sendEmail: boolean) => Promise<{ error?: string; ok?: boolean }>;
  label: string;
  confirmLabel?: string;
  emailCheckboxLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action(sendEmail);
      if (result?.error) {
        setError(result.error);
        setArmed(false);
      } else {
        setDone(true);
      }
    });
  };

  return (
    <div>
      {emailCheckboxLabel && !done && (
        <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="size-4 accent-citrus cursor-pointer"
          />
          <span className="text-small">{emailCheckboxLabel}</span>
        </label>
      )}
      <button onClick={onClick} disabled={pending || done} className={buttonStyles.secondary}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden />
        )}
        {armed ? confirmLabel : label}
      </button>
      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3 mt-3 max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}
