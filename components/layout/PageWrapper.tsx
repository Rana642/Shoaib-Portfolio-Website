import { cn } from "@/lib/utils";

/** Wraps page content with top padding to clear the fixed nav. */
export default function PageWrapper({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <main className={cn("flex-1 pt-16 md:pt-20", className)}>{children}</main>;
}
