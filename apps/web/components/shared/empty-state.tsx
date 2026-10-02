import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/format";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonProps["variant"];
  className?: string;
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  message,
  description,
  actionLabel,
  onAction,
  actionVariant = "outline",
  className
}: EmptyStateProps) {
  const body = message ?? description ?? "";
  return (
    <div className={cn("domus-card mx-auto max-w-2xl px-6 py-12 text-center opacity-95", className)}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)] shadow-[var(--domus-shadow-sm)] ring-1 ring-[var(--line)]">
        <Icon className="h-7 w-7 text-[var(--accent)]" />
      </div>
      {title ? <h3 className="mt-4 text-lg font-semibold domus-heading">{title}</h3> : null}
      <p className={cn("mx-auto max-w-md text-sm leading-6 domus-muted", title ? "mt-2" : "mt-4")}>
        {body}
      </p>
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button type="button" variant={actionVariant} onClick={onAction} title={actionLabel}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
