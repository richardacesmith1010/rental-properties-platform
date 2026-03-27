import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "gradient-btn hover:shadow-lg",
        gradient:
          "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20 hover:-translate-y-0.5 hover:from-violet-600 hover:to-purple-700",
        outline:
          "border border-zinc-200 bg-white/80 text-zinc-700 shadow-none hover:bg-zinc-50 hover:text-zinc-900",
        ghost:
          "bg-transparent text-zinc-600 shadow-none hover:bg-zinc-100/70 hover:text-zinc-900",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-600 hover:shadow-md",
        link: "text-violet-600 underline-offset-4 hover:underline",
        success: "bg-emerald-500 text-white shadow-sm scale-[1.02] pointer-events-none",
      },
      size: {
        default: "h-11 px-5 py-2 sm:h-10",
        sm: "h-11 px-3.5 text-xs sm:h-8 sm:px-3",
        lg: "h-14 px-8 text-base sm:h-12",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function CheckmarkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path
        d="M5 13l4 4L19 7"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ strokeDasharray: 24, animation: "checkmark-draw 300ms ease forwards" }}
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  success?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, success, children, disabled, ...props }, ref) => {
    if (asChild) {
      return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
    }

    const isDisabled = disabled || loading;
    const activeVariant = success ? "success" : variant;

    return (
      <button
        className={cn(buttonVariants({ variant: activeVariant, size, className }), loading && "relative cursor-wait")}
        ref={ref}
        disabled={isDisabled}
        {...props}
      >
        <span
          className={cn(
            "inline-flex items-center gap-2 transition-opacity duration-150",
            (loading || success) && "opacity-0"
          )}
        >
          {children}
        </span>

        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <SpinnerIcon />
          </span>
        )}

        {success && (
          <span className="absolute inset-0 flex items-center justify-center">
            <CheckmarkIcon />
          </span>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
