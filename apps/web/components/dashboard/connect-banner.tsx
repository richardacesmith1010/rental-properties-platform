"use client";

interface ConnectBannerProps {
  connected: boolean;
  role: "owner" | "manager";
}

export function ConnectBanner({ connected, role }: ConnectBannerProps) {
  if (connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Bank Connected</h3>
            <p className="text-sm text-muted-foreground">
              Your bank account is connected. Rent payments will be deposited directly.
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
          <h3 className="font-semibold text-foreground">Connect Your Bank Account</h3>
          <p className="text-sm text-muted-foreground">
            {role === "owner"
              ? "Connect your bank account to receive rent payments directly."
              : "Connect your bank account to receive management fee payments."}
          </p>
        </div>
        <a
          href="/connect/onboard"
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Connect Now
        </a>
      </div>
    </div>
  );
}
