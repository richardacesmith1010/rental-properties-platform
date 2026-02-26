import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
        <InboxIcon className="h-6 w-6 text-zinc-400" />
      </div>
      <p className="text-sm text-zinc-500">{message}</p>
    </div>
  );
}
