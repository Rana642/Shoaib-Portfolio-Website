"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, LoaderCircle, Pencil } from "lucide-react";
import {
  createClientProject,
  deleteClientProject,
  updateProjectPostingInstructions,
} from "@/lib/dashboard/actions/client-projects";
import { inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";
import type { ClientProject } from "@/lib/dashboard/types";

function ProjectRow({ project }: { project: ClientProject }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.posting_instructions ?? "");
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      await updateProjectPostingInstructions(project.id, text);
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <li className="py-3 border-b border-ink/5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-medium">{project.name}</p>
          {project.notes && <p className="text-small text-ink-subtle mt-0.5">{project.notes}</p>}
        </div>
        <DeleteButton projectId={project.id} />
      </div>

      <div className="mt-2">
        {editing ? (
          <div className="space-y-2">
            <textarea
              className={inputClasses}
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. No emojis at all. Warm, welcoming tone. Keep captions under 3 sentences. Always mention the location."
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={onSave} disabled={pending} className={`${buttonStyles.primary} !py-1.5 !px-3 text-small`}>
                {pending && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(project.posting_instructions ?? "");
                  setEditing(false);
                }}
                className={`${buttonStyles.secondary} !py-1.5 !px-3 text-small`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full text-left group"
          >
            <p className="text-tag font-mono uppercase tracking-widest text-ink-subtle mb-1 flex items-center gap-1.5">
              Posting style
              <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
            </p>
            {project.posting_instructions ? (
              <p className="text-small text-ink-muted whitespace-pre-wrap">{project.posting_instructions}</p>
            ) : (
              <p className="text-small text-ink-subtle italic">
                Not set — click to add (emoji use, tone, language, do&apos;s and don&apos;ts).
              </p>
            )}
          </button>
        )}
      </div>
    </li>
  );
}

function DeleteButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(async () => { await deleteClientProject(projectId); router.refresh(); })}
      disabled={pending}
      aria-label="Remove project"
      className="shrink-0 text-ink-subtle hover:text-red-700 disabled:opacity-40 transition-colors"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
    </button>
  );
}

/** A client's own separate projects/companies — defined once here, then
 *  picked from (not retyped) when building a Proposal for this client. Each
 *  project also carries its own posting style guide, read by the social MCP
 *  tools when writing captions. */
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
  const [postingInstructions, setPostingInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onAdd = () => {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("notes", notes);
    formData.set("posting_instructions", postingInstructions);
    startTransition(async () => {
      const result = await createClientProject(clientId, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
        setNotes("");
        setPostingInstructions("");
        router.refresh();
      }
    });
  };

  return (
    <Card className="p-6 max-w-2xl mt-10">
      <h2 className="text-body-lg font-semibold mb-1">Projects</h2>
      <p className="text-small text-ink-muted mb-4">
        Add each company or project this client runs — there doesn&apos;t need to be a parent
        company; they might just hold more than one, with no relation between them. Each gets its
        own charges and costing when you build a proposal, and its own posting style guide for the
        social planner. Pick from these instead of retyping them every time.
      </p>

      {projects.length > 0 && (
        <ul className="mb-4">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} />
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
      <textarea
        value={postingInstructions}
        onChange={(e) => setPostingInstructions(e.target.value)}
        placeholder="Posting style (optional) — e.g. minimal emoji use, formal tone, always in Urdu"
        aria-label="Posting style"
        rows={2}
        className={`${inputClasses} mt-3`}
      />
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
