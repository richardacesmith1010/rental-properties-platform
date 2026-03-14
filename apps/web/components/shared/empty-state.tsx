import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  showDom?: boolean;
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  message,
  description,
  actionLabel,
  onAction,
  className,
  showDom = false
}: EmptyStateProps) {
  const body = message ?? description ?? "";

  return (
    <div className={cn("domus-card px-6 py-10 text-center opacity-90", className)}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100/80">
        {showDom ? (
          <DomMascot size="sm" className="animate-domus-bob" />
        ) : (
          <Icon className="h-7 w-7 text-violet-500" />
        )}
      </div>
      {title ? <h3 className="mt-4 text-base font-semibold domus-heading">{title}</h3> : null}
      <p className={cn("text-sm domus-muted", title ? "mt-2" : "mt-4")}>{body}</p>
      {actionLabel && onAction ? (
        <div className="mt-5">
          <Button type="button" variant="outline" onClick={onAction} title={actionLabel}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
