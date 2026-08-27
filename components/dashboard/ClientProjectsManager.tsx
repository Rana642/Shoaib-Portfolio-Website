"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { createClientProject, deleteClientProject } from "@/lib/dashboard/actions/client-projects";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { ClientProject } from "@/lib/dashboard/types";

/** A client's own separate projects/companies — defined once here, then
 *  picked from (not retyped) when building a Proposal for this client. */
export default function ClientProjectsManager({
  clientId,
  projects,
}: {
  clientId: string;
  projects: ClientProject[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onAdd = () => {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("notes", notes);
    startTransition(async () => {
      const result = await createClientProject(clientId, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
        setNotes("");
        router.refresh();
      }
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      await deleteClientProject(id);
      router.refresh();
    });
  };

  return (
    <Card className="p-6 max-w-2xl mt-10">
      <h2 className="text-body-lg font-semibold mb-1">Projects</h2>
      <p className="text-small text-ink-muted mb-4">
        This client&apos;s separate projects or companies — pick from these when building a
        proposal instead of retyping them each time.
      </p>

      {projects.length > 0 && (
        <ul className="space-y-2 mb-4">
          {projects.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 py-2 border-b border-ink/5 last:border-0"
            >
              <div>
                <p className="text-small font-medium">{p.name}</p>
                {p.notes && <p className="text-small text-ink-subtle mt-0.5">{p.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDelete(p.id)}
                disabled={pending}
                aria-label="Remove project"
                className="shrink-0 text-ink-subtle hover:text-red-700 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Avenza Restaurant"
          aria-label="Project name"
          className={inputClasses}
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Project notes"
          className={inputClasses}
        />
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={pending || !name.trim()}
        className={`${buttonStyles.secondary} mt-3`}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="size-4" aria-hidden />
        )}
        Add project
      </button>
      {error && <p className="text-small text-red-700 mt-3">{error}</p>}
    </Card>
  );
}
