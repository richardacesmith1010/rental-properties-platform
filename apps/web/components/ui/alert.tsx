import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const alertVariants = cva(
  "rounded-2xl border px-4 py-3 text-sm font-medium shadow-[var(--domus-shadow-sm)]",
  {
    variants: {
      variant: {
        error:
          "border-[color:var(--domus-danger-text)] bg-[color:var(--domus-danger-bg)] text-[color:var(--domus-danger-text)]",
        success:
          "border-[color:var(--domus-success-text)] bg-[color:var(--domus-success-bg)] text-[color:var(--domus-success-text)]",
        warning:
          "border-[color:var(--domus-warning-text)] bg-[color:var(--domus-warning-bg)] text-[color:var(--domus-warning-text)]",
        info:
          "border-[color:var(--accent-line)] bg-[color:var(--accent-weak)] text-[color:var(--accent)]",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

export { Alert, alertVariants };
