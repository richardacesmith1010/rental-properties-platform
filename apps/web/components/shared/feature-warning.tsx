interface FeatureWarningProps {
  title: string;
  message: string;
}

export function FeatureWarning({ title, message }: FeatureWarningProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-900">{title}</p>
      <p className="mt-1 text-sm text-amber-800">{message}</p>
    </div>
  );
}
