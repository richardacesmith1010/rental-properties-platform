import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100/80">
        <InboxIcon className="h-6 w-6 text-indigo-500" />
      </div>
      <p className="text-sm text-indigo-900/70">{message}</p>
    </div>
  );
}
