"use client";

import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface ConnectBankStepProps {
  alreadyConnected: boolean;
  onSkip: () => void;
}

export function ConnectBankStep({ alreadyConnected, onSkip }: ConnectBankStepProps) {
  if (alreadyConnected) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-[var(--ink)]">Connect your bank</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Connect a bank account to receive rent payments securely through Stripe.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--accent-line)] bg-[var(--accent-weak)] p-4 text-sm text-[var(--ink-2)]">
        <p>Domus uses Stripe to handle payments. Connecting your bank lets tenants pay rent online, and funds are deposited directly into your account.</p>
      </div>

      <Button asChild className="w-full">
        <a href="/connect/onboard">
          <ExternalLink className="mr-2 h-4 w-4" />
          Connect Now
        </a>
      </Button>

      <button
        type="button"
        onClick={onSkip}
        className="block w-full rounded-xl text-center text-sm text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ground)] hover:text-[var(--ink)]"
      >
        Skip for now
      </button>
    </div>
  );
}
