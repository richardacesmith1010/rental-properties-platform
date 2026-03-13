"use client";

import { Button } from "@/components/ui/button";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { CheckCircle } from "lucide-react";

interface CompletionStepProps {
  stepsCompleted: string[];
  onFinish: () => void;
}

export function CompletionStep({ stepsCompleted, onFinish }: CompletionStepProps) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex w-fit items-center justify-center rounded-3xl bg-emerald-50/80 px-6 py-4">
        <DomMascot size="lg" />
      </div>

      <div>
        <h3 className="text-xl font-bold text-zinc-900">You&apos;re all set!</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Great start! Your property is ready to go.
        </p>
      </div>

      {stepsCompleted.length > 0 && (
        <div className="mx-auto max-w-xs space-y-2 text-left">
          {stepsCompleted.map((label) => (
            <div key={label} className="flex items-center gap-2 text-sm text-emerald-700">
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
