"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { createClient, updateClient } from "@/lib/dashboard/actions/clients";
import { Field, inputClasses, buttonStyles } from "@/components/dashboard/ui";
import { CURRENCIES, type Client } from "@/lib/dashboard/types";

type ProjectRow = { key: string; name: string; notes: string };

const newRow = (): ProjectRow => ({ key: crypto.randomUUID(), name: "", notes: "" });

export default function ClientForm({ client }: { client?: Client }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Inline projects are only offered when creating a client. On edit, they're
  // managed separately by ClientProjectsManager on the client's page.
  const isNew = !client;
  const [projects, setProjects] = useState<ProjectRow[]>(() => (isNew ? [newRow()] : []));

  const updateRow = (key: string, patch: Partial<ProjectRow>) =>
    setProjects((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setProjects((prev) => prev.filter((r) => r.key !== key));
  const addRow = () => setProjects((prev) => [...prev, newRow()]);

  const projectsPayload = JSON.stringify(
    projects
      .filter((r) => r.name.trim())
      .map((r) => ({ name: r.name.trim(), notes: r.notes.trim() || null }))
  );

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      // A successful action redirects, so anything returned here is a failure.
      const result = client
        ? await updateClient(client.id, formData)
        : await createClient(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={onSubmit} className="space-y-5 max-w-2xl">
      <Field
        label="Client name"
        htmlFor="name"
        hint="The person or business you deal with. If they run more than one company or project, keep this as their overall name and list those separately below — there doesn't need to be a 'main' one."
      >
        <input
          id="name"
          name="name"
          required
          defaultValue={client?.name}
          className={inputClasses}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Contact person" htmlFor="contact_person">
          <input
            id="contact_person"
            name="contact_person"
            defaultValue={client?.contact_person ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            className={inputClasses}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Phone" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            defaultValue={client?.phone ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field label="Country" htmlFor="country">
          <input
            id="country"
            name="country"
            defaultValue={client?.country ?? ""}
            className={inputClasses}
          />
        </Field>
      </div>

      <Field label="Address" htmlFor="address" hint="Appears on their quotations and invoices.">
        <textarea
          id="address"
          name="address"
          rows={2}
          defaultValue={client?.address ?? ""}
          className={inputClasses}
        />
      </Field>

      <Field
        label="Billing currency"
        htmlFor="currency"
        hint="Pre-selected when creating documents for this client."
      >
        <select
          id="currency"
          name="currency"
          defaultValue={client?.currency ?? ""}
          className={inputClasses}
        >
          <option value="">Use default</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notes" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={client?.notes ?? ""}
          className={inputClasses}
        />
      </Field>

      {isNew && (
        <div className="pt-2 border-t border-ink/10">
          <h2 className="text-body-lg font-semibold mb-1">Projects / companies</h2>
          <p className="text-small text-ink-muted mb-4">
            Add each company or project this client runs — there doesn&apos;t need to be a parent
            company; they might just hold more than one. Each gets its own charges when you build a
            proposal. You can also add or edit these later from the client&apos;s page.
          </p>

          <div className="space-y-3">
            {projects.map((row) => (
              <div key={row.key} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  placeholder="Company / project name"
                  aria-label="Project name"
                  className={inputClasses}
                />
                <div className="flex items-center gap-2">
                  <input
                    value={row.notes}
                    onChange={(e) => updateRow(row.key, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                    aria-label="Project notes"
                    className={`${inputClasses} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label="Remove project"
                    className="shrink-0 text-ink-subtle hover:text-red-700 transition-colors p-2"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addRow} className={`${buttonStyles.secondary} mt-3`}>
            <Plus className="size-4" aria-hidden />
            Add project
          </button>

          {/* Serialized list picked up by createClient on submit. */}
          <input type="hidden" name="projects" value={projectsPayload} />
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={client ? client.is_active : true}
          className="size-4 accent-citrus cursor-pointer"
        />
        <span className="text-small">Active client</span>
      </label>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {client ? "Save changes" : "Create client"}
        </button>
        <Link href="/dashboard/clients" className={buttonStyles.secondary}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
