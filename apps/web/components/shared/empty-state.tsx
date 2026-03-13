import { InboxIcon } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";

interface EmptyStateProps {
  message: string;
  showDom?: boolean;
}

export function EmptyState({ message, showDom = false }: EmptyStateProps) {
  return (
    <div className="domus-card border-dashed px-4 py-8 text-center">
      {showDom ? (
        <div className="mx-auto mb-3 flex w-fit items-center justify-center rounded-2xl bg-white/70 px-3 py-2 shadow-sm">
          <DomMascot size="md" className="animate-domus-bob" />
        </div>
      ) : (
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100/80">
          <InboxIcon className="h-6 w-6 text-violet-500" />
        </div>
      )}
      <p className="text-sm domus-muted">{message}</p>
    </div>
  );
}
