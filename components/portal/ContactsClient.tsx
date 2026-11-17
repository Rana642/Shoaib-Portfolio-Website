"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";
import { buttonStyles, inputClasses } from "@/components/dashboard/ui";
import { portalAddContact, portalDeleteContact, portalSaveContactNote, portalSetMarketingOptIn } from "@/lib/portal/contacts-actions";

type Result = { error?: string; ok?: boolean };

/** "Add a contact": for someone who didn't come through the website or WhatsApp. */
export function AddContactForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <form
      action={(fd) => {
        setError(null);
        setDone(false);
        start(async () => {
          const r = (await portalAddContact(projectId, {
            name: String(fd.get("name") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            email: String(fd.get("email") ?? ""),
            notes: String(fd.get("notes") ?? ""),
          })) as Result;
          if (r.error) return setError(r.error);
          setDone(true);
          router.refresh();
        });
      }}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto] items-end"
    >
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Name</span>
        <input name="name" maxLength={120} className={inputClasses} />
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Phone</span>
        <input name="phone" maxLength={40} inputMode="tel" className={inputClasses} />
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">E-mail</span>
        <input name="email" type="email" maxLength={160} className={inputClasses} />
      </label>
      <label className="text-small">
        <span className="block text-ink-muted mb-1">Note</span>
        <input name="notes" maxLength={2000} className={inputClasses} />
      </label>
      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : "Add"}
      </button>
      {error && <p className="text-small text-red-700 sm:col-span-5">{error}</p>}
      {done && !error && <p className="text-small text-forest sm:col-span-5">Saved.</p>}
    </form>
  );
}

/** A contact's note: edit in place, save on the button. */
export function NoteEditor({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const dirty = value.trim() !== initial.trim();
  return (
    <div className="flex items-start gap-1.5">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setState("idle");
        }}
        rows={1}
        maxLength={2000}
        aria-label="Note"
        className="w-44 resize-y rounded-md border border-ink/15 bg-white px-2 py-1 text-small"
      />
      {(dirty || state !== "idle") && (
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const r = (await portalSaveContactNote(id, value)) as Result;
              setState(r.error ?? "saved");
            })
          }
          className="rounded-md border border-ink/15 px-2 py-1 text-tag hover:bg-ink/5 disabled:opacity-50"
        >
          {pending ? "…" : state === "saved" && !dirty ? "Saved" : "Save"}
        </button>
      )}
      {state !== "idle" && state !== "saved" && <span className="text-tag text-red-700">{state}</span>}
    </div>
  );
}

export function DeleteContactButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Remove contact"
      title="Remove this contact"
      onClick={() => {
        if (!window.confirm("Remove this contact?")) return;
        start(async () => {
          await portalDeleteContact(id);
          router.refresh();
        });
      }}
      className="text-ink-subtle hover:text-red-700 cursor-pointer"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/** "Agreed to offers": staff record it (after the guest said yes in person, by phone or in writing), or take it back. */
export function OptInButton({ id, optedIn }: { id: string; optedIn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!optedIn && !window.confirm("Confirm this guest agreed to receive offers from the hotel on WhatsApp (in person, by phone or in writing).")) return;
          setError(null);
          start(async () => {
            const r = (await portalSetMarketingOptIn(id, !optedIn)) as Result;
            if (r.error) return setError(r.error);
            router.refresh();
          });
        }}
        className="rounded-md border border-ink/15 px-2 py-0.5 text-tag hover:bg-ink/5 disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? "…" : optedIn ? "Take back" : "Mark agreed"}
      </button>
      {error && <span className="text-tag text-red-700 max-w-48">{error}</span>}
    </span>
  );
}
