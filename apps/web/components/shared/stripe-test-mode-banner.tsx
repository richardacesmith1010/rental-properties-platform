"use client";

import { Alert } from "@/components/ui/alert";

export function StripeTestModeBanner() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!key.startsWith("pk_test_")) {
    return null;
  }

  return (
    <Alert variant="warning" className="mb-4">
      Stripe is in test mode. Payments will not be processed with real money.
    </Alert>
  );
}
