"use client";

import {
  ArrowRight,
  Building2,
  DoorOpen,
  FileText,
  Landmark,
  PlayCircle,
  Plus,
  type LucideIcon
} from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";
import {
  OnboardingChecklist,
  type OnboardingChecklistStep,
  type OnboardingStepId
} from "./onboarding-checklist";

interface WelcomeCardProps {
  displayName: string;
  steps: OnboardingChecklistStep[];
  onContinue: (stepId: OnboardingStepId | null) => void;
  onSkip?: () => void;
}

function getPrimaryAction(stepId: OnboardingStepId | null): {
  label: string;
  icon: LucideIcon;
} {
  switch (stepId) {
    case "property":
      return { label: "Add Your First Property", icon: Plus };
    case "unit":
      return { label: "Add Your First Unit", icon: DoorOpen };
    case "lease":
      return { label: "Create Your First Lease", icon: FileText };
    case "bank":
      return { label: "Connect Bank Account", icon: Landmark };
    case "account":
      return { label: "Finish Account Setup", icon: Building2 };
    default:
      return { label: "Open Dashboard", icon: ArrowRight };
  }
}

export function WelcomeCard({
  displayName,
  steps,
  onContinue,
  onSkip
}: WelcomeCardProps) {
  const nextStepId = steps.find((step) => !step.completed)?.id ?? null;
  const primaryAction = getPrimaryAction(nextStepId);
  const PrimaryIcon = primaryAction.icon;

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border/60 bg-card px-6 py-8 text-center shadow-sm sm:px-8">
      <div className="mx-auto mb-5 flex h-32 w-32 items-center justify-center rounded-full bg-primary/10">
        <div className="animate-domus-bob">
          <DomMascot size="xl" mood="encouraging" animate />
        </div>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Owner setup
      </p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        Welcome, {displayName}!
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
        Domus keeps your properties, leases, payments, and resident operations in one place.
        Finish these first steps to get your dashboard running smoothly.
      </p>

      <OnboardingChecklist steps={steps} className="mt-6" />

      <div className="mt-6 flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full gap-2"
          onClick={() => onContinue(nextStepId)}
          title={primaryAction.label}
        >
          <PrimaryIcon className="h-4 w-4" />
          {primaryAction.label}
        </Button>
        <a
          href="#owner-setup-tour"
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          title="Preview the Domus setup tour."
        >
          <PlayCircle className="h-4 w-4 text-primary" />
          Watch a 2-minute tour
        </a>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            title="Dismiss setup and go straight to the dashboard."
          >
            Skip setup — go to dashboard →
          </button>
        ) : null}
      </div>
    </div>
  );
}
