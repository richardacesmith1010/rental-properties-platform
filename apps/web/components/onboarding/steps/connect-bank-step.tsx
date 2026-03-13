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
        <h3 className="text-lg font-semibold text-zinc-900">Connect your bank</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Connect a bank account to receive rent payments securely through Stripe.
        </p>
      </div>

      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 text-sm text-zinc-600">
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
        className="block w-full text-center text-sm text-zinc-400 hover:text-zinc-600"
      >
        Skip for now
      </button>
    </div>
  );
}
