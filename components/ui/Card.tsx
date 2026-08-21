import { cn } from "@/lib/utils";

type CardProps = {
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export default function Card({ hover = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white/50 backdrop-blur-sm border border-ink/5 rounded-2xl p-6 transition-all duration-300",
        hover && "hover:shadow-xl hover:shadow-ink/5 hover:-translate-y-1 hover:border-citrus/30",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
