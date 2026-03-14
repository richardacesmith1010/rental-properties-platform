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
        "focus-visible:ring-2 focus-visible:ring-violet-500/20 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-red-400 focus-visible:ring-red-500/20 domus-shake",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
