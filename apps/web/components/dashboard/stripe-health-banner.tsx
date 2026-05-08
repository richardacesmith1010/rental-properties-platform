"use client";

import Link from "next/link";
import type { StripeAccountHealthStatus } from "@/lib/stripe";

export type StripeHealthStatus = StripeAccountHealthStatus | null;

interface StripeHealthBannerProps {
  status: StripeHealthStatus;
}

export function StripeHealthBanner({ status }: StripeHealthBannerProps) {
  if (status !== "restricted" && status !== "missing") {
    return null;
  }

  const headline =
    status === "missing"
      ? "Your bank connection is missing"
      : "Your bank connection needs attention";
  const body =
    status === "missing"
      ? "We can't find your bank in Stripe. Reconnect now so tenants can pay rent."
      : "Stripe needs more info before they can send rent to your bank. Finish setup now.";

  return (
    <div
      className="mt-3 rounded-xl border px-4 py-4 shadow-sm"
      style={{
        background: "var(--domus-warning-bg)",
        borderColor: "var(--domus-warning-text)",
        color: "var(--domus-warning-text)"
      }}
    >
      <h3 className="text-base font-semibold">{headline}</h3>
      <p className="mt-1 text-sm">{body}</p>
      <Link
        href="/connect/onboard"
        title="Reconnect your bank so tenants can keep paying rent."
        className="mt-3 inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90"
        style={{
          background: "var(--domus-heading-text)",
          color: "var(--domus-card-bg)"
        }}
      >
        Reconnect bank
      </Link>
    </div>
  );
}
