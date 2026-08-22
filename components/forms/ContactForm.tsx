"use client";

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
  budget: z.string().min(1, "Pick the closest range"),
  message: z.string().min(10, "A sentence or two helps me prepare"),
});

type FormData = z.infer<typeof schema>;

const budgets = [
  "Under $500/mo",
  "$500 – $2,000/mo",
  "$2,000 – $10,000/mo",
  "$10,000+/mo",
  "Not sure yet",
];

const inputClasses =
  "w-full rounded-lg bg-white/60 border border-ink/15 px-4 py-3.5 text-body placeholder:text-ink-subtle focus:outline-none focus:border-citrus focus:ring-2 focus:ring-citrus/30 transition-all";

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="bg-white/50 backdrop-blur-sm border border-citrus/40 rounded-2xl p-10 text-center">
        <CheckCircle2 className="size-10 text-cobalt mx-auto" aria-hidden />
        <h3 className="font-serif italic text-h3 mt-5">Got it — audit incoming.</h3>
        <p className="text-body text-ink-muted mt-3 max-w-md mx-auto">
          I read every message myself and reply within 24 hours on working days. Talk soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="name" className="block text-small font-medium mb-2">
            Your name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Full name"
            className={cn(inputClasses, errors.name && "border-red-500")}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-small text-red-600 mt-1.5">{errors.name.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="email" className="block text-small font-medium mb-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@company.com"
            className={cn(inputClasses, errors.email && "border-red-500")}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-small text-red-600 mt-1.5">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="business" className="block text-small font-medium mb-2">
            Business / brand
          </label>
          <input
            id="business"
            type="text"
            placeholder="Company or project name"
            className={cn(inputClasses, errors.business && "border-red-500")}
            {...register("business")}
          />
          {errors.business && (
            <p className="text-small text-red-600 mt-1.5">{errors.business.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="budget" className="block text-small font-medium mb-2">
            Monthly ad budget
          </label>
          <select
            id="budget"
            defaultValue=""
            className={cn(inputClasses, "cursor-pointer", errors.budget && "border-red-500")}
            {...register("budget")}
          >
            <option value="" disabled>
              Pick the closest range
            </option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {errors.budget && (
            <p className="text-small text-red-600 mt-1.5">{errors.budget.message}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="message" className="block text-small font-medium mb-2">
          What's going on with your marketing?
        </label>
        <textarea
          id="message"
          rows={5}
          placeholder="What are you running now, and what's not working?"
          className={cn(inputClasses, "resize-y", errors.message && "border-red-500")}
          {...register("message")}
        />
        {errors.message && (
          <p className="text-small text-red-600 mt-1.5">{errors.message.message}</p>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="submit"
          disabled={status === "sending"}
          className="group inline-flex items-center justify-center gap-2 rounded-lg bg-ink text-cloud px-6 py-3.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink/15 disabled:opacity-60 disabled:hover:translate-y-0 cursor-pointer"
        >
          {status === "sending" ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              Send my audit request
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </>
          )}
        </button>
        {status === "error" && (
          <p className="text-small text-red-600">
            Something broke — try again, or email me directly.
          </p>
        )}
      </div>
    </form>
  );
}
