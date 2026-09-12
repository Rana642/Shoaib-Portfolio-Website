"use client";

import { useRef, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { addManualAccount } from "@/lib/dashboard/actions/social";
import { inputClasses, buttonStyles, Field } from "@/components/dashboard/ui";
import type { ProjectOption } from "@/lib/dashboard/types";

export default function ManualAccountForm({ projects }: { projects: ProjectOption[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await addManualAccount(formData);
      if (result?.error) setError(result.error);
      else formRef.current?.reset();
    });
  };

  return (
    <form ref={formRef} action={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="Project" htmlFor="ma-project">
        <select id="ma-project" name="project_id" required className={inputClasses}>
          <option value="">Select…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Platform" htmlFor="ma-platform">
        <select id="ma-platform" name="platform" required className={inputClasses}>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
      </Field>
      <Field label="Label" htmlFor="ma-label" hint="Display name, e.g. the account/page name.">
        <input id="ma-label" name="label" required className={inputClasses} />
      </Field>
      <Field
        label="Account/Page ID or URN"
        htmlFor="ma-id"
        hint="LinkedIn: urn:li:organization:xxxx (or urn:li:person:xxxx). Instagram: IG Business Account id."
      >
        <input id="ma-id" name="external_id" required className={inputClasses} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Access token" htmlFor="ma-token">
          <input id="ma-token" name="access_token" required className={inputClasses} />
        </Field>
      </div>
      {error && (
        <p className="sm:col-span-2 text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Add account
        </button>
      </div>
    </form>
  );
}
