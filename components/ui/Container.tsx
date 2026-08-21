import { cn } from "@/lib/utils";

type ContainerProps = {
  variant?: "narrow" | "wide" | "full";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export default function Container({
  variant = "wide",
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        variant === "narrow" && "container-narrow",
        variant === "wide" && "container-wide",
        variant === "full" && "w-full px-6 md:px-12",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
