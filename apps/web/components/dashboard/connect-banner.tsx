"use client";

interface ConnectBannerProps {
  connected: boolean;
  role: "owner" | "manager";
  llcMembershipDetected?: boolean;
  llcAccountId?: string | null;
}

export function ConnectBanner({
  connected,
  role,
  llcMembershipDetected = false,
  llcAccountId = null
}: ConnectBannerProps) {
  const connectHref = llcMembershipDetected
    ? llcAccountId
      ? `/connect/onboard?accountId=${encodeURIComponent(llcAccountId)}&memberPayout=true`
      : "/connect/onboard?memberPayout=true"
    : "/connect/onboard";

  if (connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">
              {llcMembershipDetected ? "Payout Account Connected" : "Bank Connected"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {llcMembershipDetected
                ? "Your bank is ready to receive rent payouts."
                : "Your bank account is connected. Rent payments will be deposited directly."}
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
            {llcMembershipDetected ? "Connect Your Bank" : "Connect Your Bank Account"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {llcMembershipDetected
              ? "Connect your bank to receive rent payouts."
              : role === "owner"
                ? "Connect your bank account to receive rent payments directly."
                : "Connect your bank account to receive management fee payments."}
          </p>
        </div>
        <a
          href={connectHref}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          Connect Now
        </a>
      </div>
    </div>
  );
}
