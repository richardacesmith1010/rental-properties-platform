import type { StripeAccountHealthStatus } from "@/lib/stripe";

export type OwnerBankCardStatus = "connected" | "needs_info" | "not_started";

export interface OwnerBankCardState {
  status: OwnerBankCardStatus;
  href: string;
}

interface OwnerBankAccountStatus {
  stripeAccountId?: string | null;
  stripeConnected?: boolean;
  stripeStatus?: StripeAccountHealthStatus | null;
}

export function getOwnerBankCardState(params: {
  rentCollectionConnected: boolean;
  profileStripeConnected?: boolean;
  connectHref: string;
  accounts: OwnerBankAccountStatus[];
}): OwnerBankCardState {
  const needsAttention = params.accounts.some(
    (account) => account.stripeStatus === "restricted" || account.stripeStatus === "missing"
  );
  const hasStripeAccount =
    params.profileStripeConnected === true ||
    params.accounts.some(
      (account) => Boolean(account.stripeAccountId) || account.stripeConnected === true
    );

  if (params.rentCollectionConnected && !needsAttention) {
    return { status: "connected", href: params.connectHref };
  }

  return {
    status: needsAttention || hasStripeAccount ? "needs_info" : "not_started",
    href: params.connectHref
  };
}
