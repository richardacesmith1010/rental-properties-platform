import * as React from "react";
import { cn } from "@/lib/format";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, error, ...props }, ref) => {
  return (
    <input
      type={type}
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
    />
  );
});
Input.displayName = "Input";

export { Input };
