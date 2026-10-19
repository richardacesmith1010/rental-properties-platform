import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const badgeVariants = cva(
  "tabular-nums inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[11px] " +
    "font-semibold uppercase tracking-[0.08em] transition-colors",
  {
    variants: {
      variant: {
        default: "domus-badge",
        success: "domus-badge domus-badge-success",
        warning: "domus-badge domus-badge-warning",
        destructive: "domus-badge domus-badge-danger",
        outline: "border-[var(--line-2)] bg-transparent text-[var(--ink-2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
