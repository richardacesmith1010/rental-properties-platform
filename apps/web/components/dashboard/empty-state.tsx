import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction
}: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <Icon className="h-6 w-6 text-zinc-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>
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
