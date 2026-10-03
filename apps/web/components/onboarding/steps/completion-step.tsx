"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface CompletionStepProps {
  stepsCompleted: string[];
  onFinish: () => void;
}

export function CompletionStep({ stepsCompleted, onFinish }: CompletionStepProps) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--line)]">
        <CheckCircle className="h-8 w-8 text-[var(--pos)]" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-[var(--ink)]">You&apos;re all set!</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Great start! Your property is ready to go.
        </p>
      </div>

      {stepsCompleted.length > 0 && (
        <div className="mx-auto max-w-xs space-y-2 text-left">
          {stepsCompleted.map((label) => (
            <div key={label} className="flex items-center gap-2 text-sm text-[var(--pos)]">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      <Button onClick={onFinish} className="w-full" title="Go to your dashboard.">
        Go to Dashboard
      </Button>
    </div>
  );
}
