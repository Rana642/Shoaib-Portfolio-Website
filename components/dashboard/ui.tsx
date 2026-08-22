import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="font-serif italic text-h2">{title}</h1>
        {description && <p className="text-body text-ink-muted mt-2">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("bg-white border border-ink/10 rounded-xl", className)}>{children}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-ink/15 rounded-xl px-6 py-16 text-center">
      <p className="text-body-lg font-medium">{title}</p>
      <p className="text-small text-ink-muted mt-2 max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  draft: "bg-ink/8 text-ink-muted border-ink/15",
  sent: "bg-cobalt/10 text-cobalt border-cobalt/25",
  accepted: "bg-green-500/10 text-green-700 border-green-600/25",
  paid: "bg-green-500/10 text-green-700 border-green-600/25",
  partially_paid: "bg-citrus/20 text-ink border-citrus/50",
  rejected: "bg-red-500/10 text-red-700 border-red-600/25",
  cancelled: "bg-red-500/10 text-red-700 border-red-600/25",
  expired: "bg-ink/8 text-ink-subtle border-ink/15",
  overdue: "bg-red-500/10 text-red-700 border-red-600/25",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono uppercase text-tag tracking-widest border rounded-full px-2.5 py-1",
        statusStyles[status] ?? statusStyles.draft
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all cursor-pointer disabled:opacity-60";

export const buttonStyles = {
  primary: cn(buttonBase, "bg-ink text-cloud hover:bg-ink/90"),
  secondary: cn(buttonBase, "border border-ink/20 text-ink hover:bg-ink/5"),
  danger: cn(buttonBase, "border border-red-600/30 text-red-700 hover:bg-red-500/10"),
};

export function LinkButton({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonStyles[variant], className)}>
      {children}
    </Link>
  );
}

export const inputClasses =
  "w-full rounded-lg bg-white border border-ink/15 px-3.5 py-2.5 text-body focus:outline-none focus:border-citrus focus:ring-2 focus:ring-citrus/25 transition-all";

export const labelClasses = "block text-small font-medium mb-1.5";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClasses}>
        {label}
      </label>
      {children}
      {hint && <p className="text-small text-ink-subtle mt-1.5">{hint}</p>}
    </div>
  );
}
