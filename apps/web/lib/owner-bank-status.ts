import type { StripeAccountHealthStatus } from "@/lib/stripe";

export type OwnerBankCardStatus = "connected" | "needs_info" | "not_started";

export interface OwnerBankCardState {
  status: OwnerBankCardStatus;
  href: string;
  accountName?: string;
}

interface OwnerBankAccountStatus {
  displayName?: string | null;
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
  const affectedAccounts = params.accounts.filter(
    (account) => account.stripeStatus === "restricted" || account.stripeStatus === "missing" ||
      (Boolean(account.stripeAccountId) && account.stripeConnected !== true && account.stripeStatus == null)
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
    href: params.connectHref,
    accountName: params.accounts.length === 1
      ? params.accounts[0]?.displayName ?? undefined
      : affectedAccounts.length > 0 && affectedAccounts.length < params.accounts.length
        ? affectedAccounts[0]?.displayName ?? undefined
        : undefined
  };
}
