import * as React from "react";
import { cn } from "@/lib/format";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "domus-input flex min-h-[80px] w-full transition-all duration-150",
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
Textarea.displayName = "Textarea";

export { Textarea };
