"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2Off, LoaderCircle, Trash2 } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";

type Result = { error?: string; ok?: boolean } | undefined;
type Row = { id: string; display_phone: string | null; label: string | null; project_id: string | null; chats: number };
type Project = { id: string; label: string };

/** "Numbers" in the WhatsApp toolbar: link each number to a business. Closes on outside click / Esc / after saving. */
type Actions = {
  onSave: (accountId: string, formData: FormData) => Promise<Result>;
  onUnlink: (accountId: string) => Promise<Result>;
  onDelete: (accountId: string) => Promise<Result>;
};

/** Numbers page: link each number to a business, unlink it, or delete it. */
export default function NumbersList({ rows, projects, ...actions }: { rows: Row[]; projects: Project[] } & Actions) {
  if (!rows.length) return <p className="text-small text-ink-muted">No numbers connected yet.</p>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        // Re-mount when the saved link changes, so the dropdown shows what's really saved.
        <NumberRow key={`${r.id}-${r.project_id}-${r.label}`} row={r} projects={projects} {...actions} />
      ))}
    </div>
  );
}

function NumberRow({
  row,
  projects,
  onSave,
  onUnlink,
  onDelete,
}: { row: Row; projects: Project[] } & Actions) {
  const [pending, start] = useTransition();
  const [busy, startBusy] = useTransition();
  const linked = projects.find((p) => p.id === row.project_id);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form
      action={(fd) => {
        setError(null);
        start(async () => {
          const r = await onSave(row.id, fd);
          if (r?.error) return setError(r.error);
          setSaved(true);
          router.refresh();
        });
      }}
      className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_auto] items-end"
    >
      <p className="text-small font-mono">{row.display_phone ?? row.id.slice(0, 8)}</p>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Label</span>
        <input name="label" defaultValue={row.label ?? ""} onChange={() => setSaved(false)} className={inputClasses} />
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Business</span>
        <select name="project_id" defaultValue={row.project_id ?? ""} onChange={() => setSaved(false)} className={inputClasses}>
          <option value="">Not linked (only in my dashboard)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonStyles.secondary}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : saved ? <Check className="size-4 text-forest" aria-hidden /> : null}
        {saved ? "Saved" : "Save"}
      </button>
      <div className="sm:col-span-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-tag border-b border-ink/5 pb-3">
        {linked ? (
          <span className="text-forest">
            Linked to <strong>{linked.label}</strong> — its chats show in that client&apos;s portal
          </span>
        ) : (
          <span className="text-ink-muted">Not linked — free, only in your dashboard</span>
        )}
        {linked && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              startBusy(async () => {
                const r = await onUnlink(row.id);
                if (r?.error) setError(r.error);
                else router.refresh();
              })
            }
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-ink"
          >
            <Link2Off className="size-3" aria-hidden /> Unlink
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const ok = confirm(
              `Delete ${row.display_phone ?? "this number"} from the dashboard?

` +
                `Its ${row.chats} chat${row.chats === 1 ? "" : "s"}, messages and broadcasts here will be removed too. ` +
                `The number itself stays on WhatsApp — you can connect it again later.`
            );
            if (!ok) return;
            startBusy(async () => {
              const r = await onDelete(row.id);
              if (r?.error) setError(r.error);
              else router.refresh();
            });
          }}
          className="ml-auto inline-flex items-center gap-1 text-red-700 hover:underline"
        >
          {busy ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : <Trash2 className="size-3" aria-hidden />} Delete number
        </button>
      </div>
      {error && <p className="sm:col-span-4 text-small text-red-700">{error}</p>}
    </form>
  );
}
