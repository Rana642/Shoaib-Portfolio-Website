"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { createCredential, updateCredential, revealCredential } from "@/lib/dashboard/actions/api-vault";
import { inputClasses, buttonStyles, Field, labelClasses } from "@/components/dashboard/ui";
import { API_SERVICE_PRESETS } from "@/lib/dashboard/types";
import type { ApiCredential } from "@/lib/dashboard/types";

type FieldRow = { name: string; value: string };

/** Add mode when `editing` is omitted; edit mode preloads real (decrypted)
 *  values via revealCredential() before the form is usable — this modal
 *  always submits the full field set, so editing needs the real values on
 *  screen first, not blank inputs the user would have to re-type from
 *  scratch. */
export default function CredentialModal({
  editing,
  onClose,
}: {
  editing?: Omit<ApiCredential, "fields"> & { fieldNames: string[] };
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(Boolean(editing));
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState(editing?.service ?? API_SERVICE_PRESETS[0].value);
  const [label, setLabel] = useState(editing?.label ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [rows, setRows] = useState<FieldRow[]>(() => {
    if (editing) return [];
    const preset = API_SERVICE_PRESETS.find((p) => p.value === service);
    return (preset?.suggestedFields ?? []).map((name) => ({ name, value: "" }));
  });

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    revealCredential(editing.id).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setRows(editing.fieldNames.map((name) => ({ name, value: "" })));
      } else {
        setRows(result);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Only runs once per modal instance (editing.id is stable for its lifetime).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onServiceChange = (value: string) => {
    setService(value);
    if (!editing) {
      const preset = API_SERVICE_PRESETS.find((p) => p.value === value);
      setRows((preset?.suggestedFields ?? []).map((name) => ({ name, value: "" })));
    }
  };

  const updateRow = (i: number, patch: Partial<FieldRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, { name: "", value: "" }]);

  const onSubmit = () => {
    setError(null);
    const fd = new FormData();
    fd.set("service", service);
    fd.set("label", label);
    fd.set("notes", notes);
    fd.set("fields", JSON.stringify(rows.filter((r) => r.name.trim())));
    startTransition(async () => {
      const result = editing ? await updateCredential(editing.id, fd) : await createCredential(fd);
      if (result?.error) setError(result.error);
      else onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4 bg-white border border-ink/10 rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-medium">{editing ? "Edit credential" : "Add credential"}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Service" htmlFor="cred-service">
            <select
              id="cred-service"
              className={inputClasses}
              value={service}
              onChange={(e) => onServiceChange(e.target.value)}
            >
              {API_SERVICE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label" htmlFor="cred-label" hint="e.g. which account/business this belongs to.">
            <input
              id="cred-label"
              className={inputClasses}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </Field>
        </div>

        <div>
          <p className={labelClasses}>Fields</p>
          {loading ? (
            <p className="text-small text-ink-muted flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Decrypting current values…
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={`${inputClasses} w-2/5`}
                    placeholder="Field name"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                  />
                  <input
                    className={inputClasses}
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove field ${row.name || i + 1}`}
                    className="text-ink-subtle hover:text-red-700 transition-colors px-1"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addRow} className={`${buttonStyles.secondary} !py-1.5 !px-3 text-small`}>
                <Plus className="size-3.5" aria-hidden /> Add field
              </button>
            </div>
          )}
        </div>

        <Field label="Notes (optional)" htmlFor="cred-notes" hint="Never put a secret value here — this isn't encrypted.">
          <textarea
            id="cred-notes"
            className={inputClasses}
            rows={2}
            value={notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && (
          <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonStyles.secondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || loading || !label.trim()}
            className={buttonStyles.primary}
          >
            {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save changes" : "Add credential"}
          </button>
        </div>
      </div>
    </div>
  );
}
