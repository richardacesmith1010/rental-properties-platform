import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";

interface FeatureWarningProps {
  title: string;
  message: string;
}

export function FeatureWarning({ title, message }: FeatureWarningProps) {
  return (
    <Alert variant="warning">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--warn)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--warn)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--warn)]">{message}</p>
        </div>
      </div>
    </Alert>
  );
}
