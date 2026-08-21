import { cn } from "@/lib/utils";

type TagProps = {
  /** "pill" = citrus-tinted chip; "plain" = bare mono label */
  variant?: "pill" | "plain";
  className?: string;
  children: React.ReactNode;
};

// Citrus fails text contrast on Cloud, so chips use a citrus-tinted
// background with ink text instead of citrus text.
export default function Tag({ variant = "pill", className, children }: TagProps) {
  return (
    <span
      className={cn(
        "font-mono uppercase text-tag tracking-widest",
        variant === "pill" &&
          "inline-flex items-center gap-2 rounded-full bg-citrus/15 border border-citrus/40 px-3.5 py-2 text-ink",
        variant === "plain" && "text-ink-subtle",
        className
      )}
    >
      {children}
    </span>
  );
}
