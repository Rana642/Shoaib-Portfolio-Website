"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { submitIntake } from "@/lib/dashboard/actions/onboarding";
import { Field, inputClasses, buttonStyles, Card } from "@/components/dashboard/ui";

export default function OnboardingIntakeForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (submitted) {
    return (
      <Card variant="solid" className="p-8 text-center">
        <p className="text-body-lg font-medium">Thanks — got it.</p>
        <p className="text-small text-ink-muted mt-1">
          I&apos;ll take it from here and be in touch to kick things off.
        </p>
      </Card>
    );
  }

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await submitIntake(token, formData);
      if (res?.error) setError(res.error);
      else setSubmitted(true);
    });
  };

  return (
    <form action={onSubmit} className="space-y-6">
      <Card variant="solid" className="p-6 space-y-5">
        <Field
          label="Tell us about your business"
          htmlFor="business_overview"
          hint="What you do, who you serve, what makes you different."
        >
          <textarea id="business_overview" name="business_overview" rows={4} className={inputClasses} />
        </Field>
        <Field
          label="Current marketing channels/tools"
          htmlFor="current_channels"
          hint="What you're already using — ad accounts, website platform, CRM, etc."
        >
          <textarea id="current_channels" name="current_channels" rows={3} className={inputClasses} />
        </Field>
        <Field label="Goals" htmlFor="goals" hint="What does success look like for you?">
          <textarea id="goals" name="goals" rows={3} className={inputClasses} />
        </Field>
        <Field
          label="Brand asset links"
          htmlFor="brand_assets_links"
          hint="Logo, brand guide, existing creative — Drive/Dropbox links are fine."
        >
          <textarea id="brand_assets_links" name="brand_assets_links" rows={2} className={inputClasses} />
        </Field>
        <Field
          label="Access notes"
          htmlFor="access_notes"
          hint="What access have you already shared (ad accounts, page roles, etc.), or plan to?"
        >
          <textarea id="access_notes" name="access_notes" rows={2} className={inputClasses} />
        </Field>
        <Field label="Anything else?" htmlFor="additional_notes">
          <textarea id="additional_notes" name="additional_notes" rows={2} className={inputClasses} />
        </Field>
      </Card>

      {error && (
        <p className="text-small text-red-700 bg-red-500/10 border border-red-600/20 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        Submit
      </button>
    </form>
  );
}
