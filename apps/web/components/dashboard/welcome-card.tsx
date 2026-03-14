"use client";

import { Check } from "lucide-react";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { Button } from "@/components/ui/button";

interface WelcomeCardProps {
  fullName?: string | null;
  nickname?: string | null;
  role: string;
  stripeConnected: boolean;
  hasProperty: boolean;
  hasUnit: boolean;
  hasLease: boolean;
  onAddProperty: () => void;
}

interface ChecklistItem {
  label: string;
  complete: boolean;
}

function getFirstName(fullName?: string | null) {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}

function ChecklistRow({ label, complete }: ChecklistItem) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={
          complete
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
            : "h-5 w-5 rounded-full border border-violet-300 bg-transparent"
        }
      >
        {complete ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span
        className={
          complete
            ? "text-sm text-emerald-700 line-through"
            : "text-sm text-zinc-700"
        }
      >
        {label}
      </span>
    </li>
  );
}

export function WelcomeCard({
  fullName,
  nickname,
  role: _role,
  stripeConnected,
  hasProperty,
  hasUnit,
  hasLease,
  onAddProperty
}: WelcomeCardProps) {
  const displayName = nickname?.trim() || getFirstName(fullName);
  const checklistItems: ChecklistItem[] = [
    { label: "Profile completed", complete: true },
    { label: "Account set up", complete: true },
    { label: "Add a property", complete: hasProperty },
    { label: "Add a unit", complete: hasUnit },
    { label: "Create a lease", complete: hasLease },
    { label: "Connect bank account", complete: stripeConnected }
  ];

  let primaryLabel = "Go to Dashboard";
  let primaryAction = () => window.location.reload();

  if (!hasProperty) {
    primaryLabel = "Add Your First Property";
    primaryAction = onAddProperty;
  } else if (!hasUnit) {
    primaryLabel = "Add a Unit";
    primaryAction = onAddProperty;
  } else if (!hasLease) {
    primaryLabel = "Create a Lease";
    primaryAction = onAddProperty;
  } else if (!stripeConnected) {
    primaryLabel = "Connect Bank Account";
    primaryAction = () => {
      window.location.href = "/connect/onboard";
    };
  }

  return (
    <div className="domus-card mx-auto w-full max-w-lg px-8 py-8 text-center">
      <div className="mb-5 flex justify-center">
        <div className="animate-domus-bob rounded-3xl bg-violet-50/80 px-4 py-3">
          <DomMascot size="lg" />
        </div>
      </div>
      <h2 className="text-xl font-semibold domus-heading">Welcome, {displayName}!</h2>
      <p className="mt-2 text-sm domus-muted">
        Let&apos;s get your first property set up. Here&apos;s your progress:
      </p>
      <ul className="mt-6 space-y-3 text-left">
        {checklistItems.map((item) => (
          <ChecklistRow key={item.label} {...item} />
        ))}
      </ul>
      <Button
        type="button"
        className="mt-7"
        onClick={primaryAction}
        title={primaryLabel}
      >
        {primaryLabel}
      </Button>
    </div>
  );
}
