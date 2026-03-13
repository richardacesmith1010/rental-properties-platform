import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DomMascot } from "@/components/gamification/dom-mascot";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  showDom?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  showDom = false
}: EmptyStateProps) {
  return (
    <div className="domus-card px-6 py-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-100/80">
        {showDom ? (
          <DomMascot size="sm" className="animate-domus-bob" />
        ) : (
          <Icon className="h-7 w-7 text-violet-500" />
        )}
      </div>
      <h3 className="mt-4 text-base font-semibold domus-heading">{title}</h3>
      <p className="mt-2 text-sm domus-muted">{description}</p>
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
