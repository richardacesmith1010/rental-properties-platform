"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface SubmitButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  title?: string;
  disabled?: boolean;
}

export function SubmitButton({
  children,
  className,
  variant = "default",
  size = "default",
  title,
  disabled = false
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const resolvedTitle = title ?? "Click to submit this action.";

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      variant={variant}
      size={size}
      className={className}
      title={resolvedTitle}
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Working...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
