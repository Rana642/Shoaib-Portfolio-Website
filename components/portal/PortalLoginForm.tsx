"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { LoaderCircle } from "lucide-react";
import { Field, buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { portalClientId } from "@/lib/dashboard/roles";

export default function PortalLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message === "Invalid login credentials" ? "That email and password don't match." : signInError.message);
      setLoading(false);
      return;
    }
    // Only client-portal logins belong here — anything else is signed back out.
    if (!portalClientId(data.user)) {
      await supabase.auth.signOut();
      setError("This account doesn't have access to the client portal.");
      setLoading(false);
      return;
    }

    // Portal paths only, so ?next= can't become an open redirect.
    const next = searchParams.get("next");
    router.push(next && /^\/portal(\/|$)/.test(next) ? next : "/portal");
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email" htmlFor="portal-email">
        <input
          id="portal-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClasses}
        />
      </Field>
      <Field label="Password" htmlFor="portal-password">
        <input
          id="portal-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses}
        />
      </Field>
      {error && <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" disabled={loading} className={`${buttonStyles.primary} w-full`}>
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Sign in
      </button>
      <p className="text-center">
        <Link href="/portal/forgot" className="text-small text-ink-muted hover:text-ink underline underline-offset-2">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
