"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { StrengthMeter } from "@/components/dashboard/vault/PasswordInput";
import { passwordStrength } from "@/lib/password-generator";
import { completePortalWelcome } from "@/lib/portal/actions";

const MIN = 10;

/** Sets the password from an invite or reset link. The link's one-time
 *  token is only redeemed on submit (see portalWelcomeUrl). */
export default function WelcomeForm({ token, type }: { token: string; type: "invite" | "recovery" }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    // Redirects to /portal on success.
    const res = await completePortalWelcome(token, type, password);
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      setExpired(Boolean("expired" in res && res.expired));
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="New password" htmlFor="welcome-password" hint={`At least ${MIN} characters.`}>
        <input
          id="welcome-password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses}
        />
        {password && <StrengthMeter strength={passwordStrength(password)} />}
      </Field>
      <Field label="Confirm password" htmlFor="welcome-confirm">
        <input
          id="welcome-confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClasses}
        />
      </Field>
      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2">
          {error}{" "}
          {expired && type === "recovery" && (
            <Link href="/portal/forgot" className="underline underline-offset-2">
              Request a new link
            </Link>
          )}
        </p>
      )}
      <button type="submit" disabled={loading} className={`${buttonStyles.primary} w-full`}>
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {type === "invite" ? "Set password and open my portal" : "Save new password"}
      </button>
    </form>
  );
}
