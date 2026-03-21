import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
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
  showDom?: boolean;
}

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  message,
  description,
  actionLabel,
  onAction,
  actionVariant = "outline",
  className,
  showDom = true
}: EmptyStateProps) {
  const body = message ?? description ?? "";
  const hasCustomIcon = Icon !== InboxIcon;

  return (
    <div className={cn("domus-card mx-auto max-w-2xl px-6 py-12 text-center opacity-95", className)}>
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 shadow-sm ring-1 ring-border/60">
        {showDom ? (
          <>
            <DomMascot size="md" mood="pointing" className="animate-domus-bob" />
            {hasCustomIcon ? (
              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                <Icon className="h-4 w-4 text-primary" />
              </span>
            ) : null}
          </>
        ) : (
          <Icon className="h-7 w-7 text-primary" />
        )}
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
