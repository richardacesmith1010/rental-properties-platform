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
Textarea.displayName = "Textarea";

export { Textarea };
