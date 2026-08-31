"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Plus } from "lucide-react";
import { createIntake } from "@/lib/dashboard/actions/intakes";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { Client, ClientProject } from "@/lib/dashboard/types";

export default function IntakeCreateForm({
  clients,
  clientProjects = {},
}: {
  clients: Client[];
  /** client id -> that client's saved projects, offered as quick-pick chips. */
  clientProjects?: Record<string, ClientProject[]>;
}) {
  const [clientId, setClientId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Picking an existing client pre-fills the business name (still editable).
  const onSelectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client) setBusinessName(client.name);
  };

  const projects = clientId ? clientProjects[clientId] ?? [] : [];

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createIntake(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <Card className="p-6 space-y-5 max-w-xl">
      <form action={onSubmit} className="space-y-5">
        {clients.length > 0 && (
          <Field
            label="Existing client"
            htmlFor="client_id"
            hint="Optional — link this intake to a client on file, or just type a name below."
          >
            <select
              id="client_id"
              name="client_id"
              value={clientId}
              onChange={(e) => onSelectClient(e.target.value)}
              className={inputClasses}
            >
              <option value="">Not linked / new</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {projects.length > 0 && (
          <div>
            <p className="text-small font-medium mb-2">This client&apos;s projects</p>
            <div className="flex flex-wrap gap-2">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBusinessName(p.name)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-small transition-all ${
                    businessName === p.name
                      ? "border-citrus bg-citrus/15 text-ink font-medium"
                      : "border-ink/15 hover:border-citrus hover:bg-citrus/10"
                  }`}
                >
                  <Plus className="size-3.5" aria-hidden />
                  {p.name}
                </button>
              ))}
            </div>
            <p className="text-tag text-ink-subtle mt-2">
              Click a project to use it as the intake&apos;s name, or type your own below.
            </p>
          </div>
        )}

        <Field
          label="Business name"
          htmlFor="business_name"
          hint="Shown to the client at the top of their intake form."
        >
          <input
            id="business_name"
            name="business_name"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputClasses}
          />
        </Field>

        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={buttonStyles.primary}>
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Create &amp; get link
          </button>
          <Link href="/dashboard/intakes" className={buttonStyles.secondary}>
            Cancel
          </Link>
        </div>
      </form>
    </Card>
  );
}
