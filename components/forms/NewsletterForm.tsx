"use client";

import { useState } from "react";
import { LoaderCircle, Check } from "lucide-react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <p className="flex items-center gap-2 text-small text-cloud/70">
        <Check className="size-4 text-citrus" aria-hidden />
        You're in — check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        aria-label="Email address"
        className="flex-1 min-w-0 rounded-lg bg-cloud/10 border border-cloud/15 px-4 py-3 text-small text-cloud placeholder:text-cloud/40 focus:outline-none focus:border-citrus"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="flex items-center justify-center gap-2 rounded-lg bg-citrus text-ink px-4 py-3 text-small font-medium hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
      >
        {status === "sending" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : "Join"}
      </button>
      {status === "error" && (
        <p className="text-small text-red-300 absolute mt-12">Something broke — try again.</p>
      )}
    </form>
  );
}
