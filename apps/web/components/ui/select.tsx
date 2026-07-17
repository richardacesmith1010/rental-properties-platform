import * as React from "react";
import { cn } from "@/lib/format";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, error, ...props }, ref) => {
  return (
    <select
      className={cn(
        "domus-input flex h-10 w-full transition-all duration-150",
        "focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "domus-shake",
        className
      )}
      data-invalid={error ? "true" : undefined}
      aria-invalid={error || undefined}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
