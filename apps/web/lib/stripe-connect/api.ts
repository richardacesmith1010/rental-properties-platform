import { createAdminClient } from "@/lib/supabase/admin";
import { assertStripeEligibleAccount } from "@/lib/client-accounts";
import { getStripeAccountHealth, getStripeSecretKey, type StripeAccountHealthStatus } from "@/lib/stripe";

export interface StripeAccountResponse {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export interface StripeExpressAccountParams {
  type: "express";
  country: "US";
  capabilities: { card_payments: { requested: true }; transfers: { requested: true } };
  business_profile: { mcc: "6513"; url: string };
}

export interface StoredStripeAccount {
  id: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_status: StripeAccountHealthStatus | null;
  stripe_last_verified_at: string | null;
}

export const STRIPE_VERIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isStripeVerificationStale(lastVerifiedAt: string | null, now = Date.now()): boolean {
  const verifiedAt = lastVerifiedAt ? Date.parse(lastVerifiedAt) : NaN;
  return !Number.isFinite(verifiedAt) || now - verifiedAt >= STRIPE_VERIFICATION_MAX_AGE_MS;
}

export async function refreshStaleStripeAccounts<T extends StoredStripeAccount>(accounts: T[]): Promise<T[]> {
  const admin = createAdminClient();
  return Promise.all(accounts.map(async (account) => {
    if (!account.stripe_account_id || !isStripeVerificationStale(account.stripe_last_verified_at)) {
      return account;
    }
    try {
      const health = await getStripeAccountHealth(account.stripe_account_id);
      const verifiedAt = new Date().toISOString();
      const { error } = await admin.from("ownership_accounts")
        .update({ stripe_status: health.status, stripe_last_verified_at: verifiedAt })
        .eq("id", account.id);
      if (error) {
        console.error("[stripe-connect] Failed to store Stripe status:", error);
        return account;
      }
      return { ...account, stripe_status: health.status, stripe_last_verified_at: verifiedAt };
    } catch (error) {
      console.error("[stripe-connect] Failed to refresh Stripe status:", error);
      return account;
    }
  }));
}

export const DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL = "https://domusbase.com";

export function buildExpressAccountParams(url: string): StripeExpressAccountParams {
  return {
    type: "express",
    country: "US",
    capabilities: {
      card_payments: {
        requested: true
      },
      transfers: {
        requested: true
      }
    },
    business_profile: {
      mcc: "6513",
      url
    }
  };
}

export function getDefaultExpressAccountBusinessProfileUrl(): string {
  return DEFAULT_EXPRESS_ACCOUNT_BUSINESS_PROFILE_URL;
}

export function buildExpressAccountRequestBody(
  params: StripeExpressAccountParams,
  options?: { email?: string }
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("type", params.type);
  if (options?.email) {
    body.set("email", options.email);
  }
  body.set("country", params.country);
  body.set("capabilities[card_payments][requested]", String(params.capabilities.card_payments.requested));
  body.set("capabilities[transfers][requested]", String(params.capabilities.transfers.requested));
  body.set("business_profile[mcc]", params.business_profile.mcc);
  body.set("business_profile[url]", params.business_profile.url);
  return body;
}

export async function stripeConnectRequest<T>(path: string, options?: { method?: "GET" | "POST"; body?: URLSearchParams }) {
  const secretKey = getStripeSecretKey();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options?.method ?? "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: options?.body?.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Stripe Connect request failed: ${response.status} - ${errorBody}`);
  }

  return (await response.json()) as T;
}

export type ConnectContext = { kind: "profile" } | { kind: "account"; accountId: string };

export async function assertConnectContext(context: ConnectContext) {
  if (context.kind === "account") await assertStripeEligibleAccount(context.accountId);
}

export async function createExpressAccount(email: string, context: ConnectContext): Promise<{ id: string }> {
  await assertConnectContext(context);
  const params = buildExpressAccountParams(getDefaultExpressAccountBusinessProfileUrl());
  const body = buildExpressAccountRequestBody(params, { email });

  const account = await stripeConnectRequest<{ id: string }>("/accounts", {
    method: "POST",
    body
  });

  return { id: account.id };
}

export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
  context: ConnectContext
): Promise<{ url: string }> {
  await assertConnectContext(context);
  const body = new URLSearchParams();
  body.set("account", accountId);
  body.set("refresh_url", refreshUrl);
  body.set("return_url", returnUrl);
  body.set("type", "account_onboarding");

  const link = await stripeConnectRequest<{ url: string }>("/account_links", {
    method: "POST",
    body
  });

  return { url: link.url };
}

export async function getAccount(accountId: string): Promise<{
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}> {
  const account = await stripeConnectRequest<StripeAccountResponse>(`/accounts/${accountId}`, {
    method: "GET"
  });

  return {
    id: account.id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted
  };
}

export async function createLoginLink(accountId: string, context: ConnectContext): Promise<{ url: string }> {
  await assertConnectContext(context);
  const link = await stripeConnectRequest<{ url: string }>(`/accounts/${accountId}/login_links`, {
    method: "POST",
    body: new URLSearchParams()
  });

  return { url: link.url };
}
