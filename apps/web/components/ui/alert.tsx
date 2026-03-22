import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const alertVariants = cva(
  "rounded-lg border px-3 py-2 text-sm font-medium",
  {
    variants: {
      variant: {
        error: "border-red-300 bg-red-100 text-red-800",
        success: "border-emerald-300 bg-emerald-100 text-emerald-800",
        warning: "border-amber-300 bg-amber-100 text-amber-800",
        info: "border-blue-300 bg-blue-100 text-blue-800",
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
