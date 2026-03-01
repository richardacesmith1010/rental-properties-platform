import { AlertTriangle } from "lucide-react";

interface FeatureWarningProps {
  title: string;
  message: string;
}

export function FeatureWarning({ title, message }: FeatureWarningProps) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="mt-1 text-sm text-amber-800">{message}</p>
        </div>
      </div>
    </div>
  );
}
