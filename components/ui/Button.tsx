import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  href?: string;
  withArrow?: boolean;
  /** Renders a plain <a download> instead of next/link — for static file downloads. */
  download?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const base =
  "group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-sm font-medium transition-all duration-300 cursor-pointer";

const variants = {
  // Highest-contrast element on the page — the one action that pops
  primary: "bg-ink text-cloud hover:-translate-y-0.5 hover:shadow-xl hover:shadow-ink/15",
  // Citrus-forward on hover; text stays ink for contrast
  secondary:
    "bg-transparent text-ink border border-ink/20 hover:border-citrus hover:bg-citrus hover:-translate-y-0.5",
  ghost:
    "px-0 py-0 rounded-none text-ink underline-offset-4 decoration-citrus decoration-2 hover:underline",
};

export default function Button({
  variant = "primary",
  href,
  withArrow = false,
  download = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(base, variants[variant], className);
  const content = (
    <>
      {children}
      {withArrow && (
        <ArrowRight
          className="size-4 transition-transform duration-300 group-hover:translate-x-1"
          aria-hidden
        />
      )}
    </>
  );

  if (href && download) {
    return (
      <a href={href} download className={classes}>
        {content}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button className={classes} {...props}>
      {content}
    </button>
  );
}
