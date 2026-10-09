"use client";

/*
 * Short order form for a single setup. Posts to /api/contact with the setup
 * name, so the lead lands in the same inbox/Supabase table as audit requests
 * but is labelled as a setup order.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Please tell me your name"),
  email: z.string().email("That email doesn't look right"),
  business: z.string().min(2, "What's the business called?"),
  message: z.string().max(5000).optional(),
});

type FormData = z.infer<typeof schema>;

const inputClasses =
  "w-full rounded-lg bg-white/60 border border-ink/15 px-4 py-3.5 text-body placeholder:text-ink-subtle focus:outline-none focus:border-citrus focus:ring-2 focus:ring-citrus/30 transition-all";

export default function SetupOrderForm({ setupName }: { setupName: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, budget: "Setup order", setup: setupName }),
      });
      if (res.status === 422) {
        // The server found a fake / mistyped email — show it under the field.
        const body = (await res.json().catch(() => ({}))) as { field?: string; error?: string };
        if (body.field === "email") {
          setError("email", { message: body.error ?? "That email doesn't look right" });
          setStatus("idle");
          return;
        }
      }
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="bg-white/60 border border-citrus/40 rounded-2xl p-8 text-center">
        <CheckCircle2 className="size-10 text-cobalt mx-auto" aria-hidden />
        <h3 className="font-sans font-semibold text-xl md:text-2xl mt-5">Order received.</h3>
        <p className="text-body text-ink-muted mt-3 max-w-md mx-auto">
          I&apos;ll reply within 24 hours on working days with the price, timeline, and what
          I need from you.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="so-name" className="block text-small font-medium mb-2">
            Your name
          </label>
          <input id="so-name" placeholder="Full name" className={cn(inputClasses, errors.name && "border-red-500")} {...register("name")} />
          {errors.name && <p className="text-small text-red-600 mt-1.5">{errors.name.message}</p>}
        </div>
        <div>
          <label htmlFor="so-email" className="block text-small font-medium mb-2">
            Email
          </label>
          <input
            id="so-email"
            type="email"
            placeholder="you@company.com"
            className={cn(inputClasses, errors.email && "border-red-500")}
            {...register("email")}
          />
          {errors.email && <p className="text-small text-red-600 mt-1.5">{errors.email.message}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="so-business" className="block text-small font-medium mb-2">
          Business / website
        </label>
        <input
          id="so-business"
          placeholder="Business name or website"
          className={cn(inputClasses, errors.business && "border-red-500")}
          {...register("business")}
        />
        {errors.business && <p className="text-small text-red-600 mt-1.5">{errors.business.message}</p>}
      </div>
      <div>
        <label htmlFor="so-message" className="block text-small font-medium mb-2">
          Anything I should know? <span className="text-ink-subtle font-normal">(optional)</span>
        </label>
        <textarea
          id="so-message"
          rows={3}
          placeholder="Platform, deadline, what's already set up"
          className={cn(inputClasses, "resize-y")}
          {...register("message")}
        />
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-6 py-3.5 text-sm font-medium text-cloud transition-all duration-300 hover:bg-ink/90 disabled:opacity-60"
      >
        {status === "sending" ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <>
            Order this setup
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </>
        )}
      </button>
      {status === "error" && (
        <p className="text-small text-red-600">
          That didn&apos;t send. Try again, or message me on WhatsApp.
        </p>
      )}
      <p className="text-small text-ink-muted">No payment now. I confirm the price and timeline first.</p>
    </form>
  );
}
