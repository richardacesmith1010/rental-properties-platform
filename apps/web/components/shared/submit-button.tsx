"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "gradient" | "outline" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  title?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export function SubmitButton({
  children,
  className,
  variant = "default",
  size = "default",
  title,
  disabled = false,
  onClick,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const resolvedTitle = title ?? "Click to submit this action.";

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      loading={pending}
      variant={variant}
      size={size}
      className={className}
      title={resolvedTitle}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
