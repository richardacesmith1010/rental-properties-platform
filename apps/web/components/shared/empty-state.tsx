import { InboxIcon } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";

interface EmptyStateProps {
  message: string;
  showDom?: boolean;
}

export function EmptyState({ message, showDom = false }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-8 text-center">
      {showDom ? (
        <div className="mx-auto mb-3 flex w-fit items-center justify-center rounded-2xl bg-white/70 px-3 py-2 shadow-sm">
          <DomMascot expression="thinking" size="md" className="text-violet-600" />
        </div>
      ) : (
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100/80">
          <InboxIcon className="h-6 w-6 text-violet-500" />
        </div>
      )}
      <p className="text-sm text-violet-900/70">{message}</p>
    </div>
  );
}
