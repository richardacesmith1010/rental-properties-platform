"use client";

import { Button } from "@/components/ui/button";

interface ConnectBannerProps {
  connected: boolean;
  role: "owner" | "manager";
  href?: string;
}

export function ConnectBanner({ connected, role, href = "/connect/onboard" }: ConnectBannerProps) {
  if (connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {role === "owner" ? "Rent payments are set up." : "Management fee payments are set up."}
            </h3>
            <p className="text-sm text-muted-foreground">
              {role === "owner"
                ? "Stripe is ready to collect rent for your properties."
                : "Stripe is ready to send your management fee payments."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏦</span>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">
            {role === "owner" ? "Set up rent payments." : "Set up management fee payments."}
          </h3>
          <p className="text-sm text-muted-foreground">
            {role === "owner"
              ? "Finish Stripe setup so your properties can collect rent."
              : "Finish Stripe setup so you can receive management fee payments."}
          </p>
        </div>
        <Button asChild variant="outline" className="border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn)] hover:bg-[var(--warn-bg)] hover:brightness-95">
          <a href={href} title="Set up Stripe payments.">Set up now</a>
        </Button>
      </div>
    </div>
  );
}
