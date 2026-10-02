import { Landmark } from "lucide-react";
import { cn } from "@/lib/format";

interface DomusLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  alt?: string;
  priority?: boolean;
}

const sizeClasses = {
  sm: "h-7 text-sm",
  md: "h-9 text-base",
  lg: "h-11 text-lg"
} as const;

export function DomusLogo({ size = "md", className, alt = "Domus" }: DomusLogoProps) {
  return (
    <span
      aria-label={alt}
      className={cn("inline-flex items-center gap-2 font-semibold tracking-[-0.02em] text-[var(--ink)]", sizeClasses[size], className)}
    >
      <span className="flex aspect-square h-full items-center justify-center rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--line)]">
        <Landmark aria-hidden="true" className="h-1/2 w-1/2 text-[var(--accent)]" />
      </span>
      <span>Domus</span>
    </span>
  );
}
