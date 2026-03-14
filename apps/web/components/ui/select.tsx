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
        "focus-visible:ring-2 focus-visible:ring-violet-500/20 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-red-400 focus-visible:ring-red-500/20 domus-shake",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

export { Select };
