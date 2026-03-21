"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { cn } from "@/lib/format";

export type OnboardingStepId = "profile" | "account" | "property" | "unit" | "lease" | "bank";

export interface OnboardingChecklistStep {
  id: OnboardingStepId;
  label: string;
  description: string;
  completed: boolean;
}

interface OnboardingChecklistProps {
  steps: OnboardingChecklistStep[];
  className?: string;
}

export function OnboardingChecklist({ steps, className }: OnboardingChecklistProps) {
  const completedStepIds = useMemo(
    () => steps.filter((step) => step.completed).map((step) => step.id),
    [steps]
  );
  const [animatedStepIds, setAnimatedStepIds] = useState<OnboardingStepId[]>([]);
  const previousCompletedRef = useRef<OnboardingStepId[]>(completedStepIds);

  useEffect(() => {
    const previousCompleted = previousCompletedRef.current;
    const newlyCompleted = completedStepIds.filter((stepId) => !previousCompleted.includes(stepId));
    previousCompletedRef.current = completedStepIds;

    if (newlyCompleted.length === 0) {
      return;
    }

    setAnimatedStepIds((current) => Array.from(new Set([...current, ...newlyCompleted])));
    const timeoutId = window.setTimeout(() => {
      setAnimatedStepIds((current) =>
        current.filter((stepId) => !newlyCompleted.includes(stepId))
      );
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [completedStepIds]);

  const activeStepId = steps.find((step) => !step.completed)?.id ?? null;
  const completedSteps = completedStepIds.length;
  const totalSteps = steps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className={cn("space-y-4 text-left", className)}>
      <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
        <div className="shrink-0 rounded-full bg-primary/10 p-2">
          <DomMascot size="md" mood="waving" animate />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {completedSteps} of {totalSteps} complete
          </p>
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground">
              {completedSteps} of {totalSteps} complete
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-medium text-foreground">{progressPct}%</span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {steps.map((step) => {
          const isActive = activeStepId === step.id && !step.completed;
          const animateCompletion = animatedStepIds.includes(step.id);

          return (
            <div
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-border/60 bg-background/60 p-3 transition-all duration-300",
                step.completed && "opacity-65",
                isActive && "bg-primary/5 ring-1 ring-primary/20 shadow-sm",
                animateCompletion && "scale-[1.01]"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  step.completed
                    ? "bg-emerald-500/15 text-emerald-600"
                    : isActive
                      ? "bg-primary/10 text-primary"
                      : "border border-border bg-muted/50 text-muted-foreground",
                  animateCompletion && "animate-bounce"
                )}
              >
                {step.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "font-medium text-foreground transition-colors duration-300",
                      step.completed && "text-muted-foreground line-through"
                    )}
                  >
                    {step.label}
                  </p>
                  {isActive ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Next up
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
