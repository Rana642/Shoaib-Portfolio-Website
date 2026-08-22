"use client";

import { useState, useTransition } from "react";
import { Trash2, LoaderCircle } from "lucide-react";
import { buttonStyles } from "@/components/dashboard/ui";

/**
 * Two-step delete: the first click arms it, the second confirms. Avoids a
 * browser confirm() dialog while still making an irreversible action
 * deliberate rather than a stray click.
 */
export default function DeleteButton({
  action,
  label = "Delete",
  confirmLabel = "Click again to confirm",
}: {
  action: () => Promise<{ error?: string; ok?: boolean }>;
  label?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        setArmed(false);
      }
    });
  };

  return (
    <div>
      <button onClick={onClick} disabled={pending} className={buttonStyles.danger}>
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
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
