"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getStripeConnectOnboardingErrorCopy } from "@/lib/stripe-errors";
import { assertStripeEligibleAccount, STRIPE_CLIENT_MESSAGE, StripeNotEligibleError } from "@/lib/client-accounts";
import { createAccountLink, createExpressAccount, createLoginLink, getAccount, hasRentCollectionAuthorityForAccount } from "@/lib/stripe-connect";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
}

async function requireConnectedRole() {
  return requireAuth("owner", "manager");
}

export async function initiateStripeConnect(): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    if (!checkRateLimit(`initiateStripeConnect:${user.id}`, 5, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!user.email) {
      return { success: false, error: "Your account is missing an email address." };
    }
    let stripeAccountId = profile?.stripe_account_id ?? null;
    if (!stripeAccountId) {
      const account = await createExpressAccount(user.email, { kind: "profile" });
      stripeAccountId = account.id;
      const { error } = await admin
        .from("profiles")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_onboarding_complete: false
        })
        .eq("id", user.id);

      if (error) {
        return { success: false, error: "Failed to save your Stripe account." };
      }
    }
    const appUrl = getAppUrl();
    const accountLink = await createAccountLink(
      stripeAccountId, `${appUrl}/connect/refresh`, `${appUrl}/connect/return`, { kind: "profile" }
    );
    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateStripeConnect error:", err);
    return {
      success: false,
      error: getStripeConnectOnboardingErrorCopy(err).description
    };
  }
}

export async function initiateAccountStripeConnect(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const accountId = formData.get("accountId");
    if (typeof accountId !== "string" || accountId.length === 0) {
      return { success: false, error: "Missing account ID." };
    }
    if (!checkRateLimit(`initiateAccountStripeConnect:${user.id}`, 5, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    await assertStripeEligibleAccount(accountId);
    const { canUserAdministerOwnershipAccount } = await import("@/lib/ownership");
    const canAdministerAccount = await canUserAdministerOwnershipAccount(user.id, accountId);
    if (!canAdministerAccount) {
      return { success: false, error: "Access denied." };
    }
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("ownership_accounts")
      .select("stripe_account_id, display_name")
      .eq("id", accountId)
      .maybeSingle();
    if (!account) {
      return { success: false, error: "Account not found." };
    }
    let stripeAccountId = account.stripe_account_id ?? null;
    if (!stripeAccountId) {
      if (!user.email) {
        return { success: false, error: "Your account is missing an email address." };
      }
      const stripeAccount = await createExpressAccount(user.email, { kind: "account", accountId });
      stripeAccountId = stripeAccount.id;
      const { error } = await admin
        .from("ownership_accounts")
        .update({
          stripe_account_id: stripeAccountId,
          stripe_onboarding_complete: false
        })
        .eq("id", accountId);

      if (error) {
        return { success: false, error: "Failed to save Stripe account." };
      }
    }
    const appUrl = getAppUrl();
    const encodedAccountId = encodeURIComponent(accountId);
    const accountLink = await createAccountLink(
      stripeAccountId,
      `${appUrl}/connect/refresh?accountId=${encodedAccountId}`,
      `${appUrl}/connect/return?accountId=${encodedAccountId}`,
      { kind: "account", accountId }
    );
    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateAccountStripeConnect error:", err);
    return {
      success: false,
      error: err instanceof StripeNotEligibleError ? STRIPE_CLIENT_MESSAGE : getStripeConnectOnboardingErrorCopy(err).description
    };
  }
}

export async function initiateMemberPayoutConnect(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const accountId = formData.get("accountId");
    const profileId = formData.get("profileId");

    if (typeof accountId !== "string" || accountId.length === 0) {
      return { success: false, error: "Missing account ID." };
    }
    if (!checkRateLimit(`initiateMemberPayoutConnect:${user.id}`, 5, 60 * 60 * 1000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    await assertStripeEligibleAccount(accountId);
    const requestedProfileId = typeof profileId === "string" && profileId.length > 0 ? profileId : user.id;
    const isSelfService = requestedProfileId === user.id;
    const { canUserAdministerOwnershipAccount } = await import("@/lib/ownership");
    if (isSelfService) {
      const admin = createAdminClient();
      const membershipCheck = await admin
        .from("ownership_account_members")
        .select("account_id")
        .eq("account_id", accountId)
        .eq("profile_id", user.id)
        .eq("active", true)
        .maybeSingle();

      if (membershipCheck.error) {
        return { success: false, error: "Unable to verify your membership right now." };
      }
      if (!membershipCheck.data) {
        return { success: false, error: "You are not a member of this account." };
      }
    } else {
      const canAdmin = await canUserAdministerOwnershipAccount(user.id, accountId);
      if (!canAdmin) {
        return { success: false, error: "Access denied." };
      }
    }
    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("ownership_account_members")
      .select("profile_id, payout_stripe_account_id")
      .eq("account_id", accountId)
      .eq("profile_id", isSelfService ? user.id : requestedProfileId)
      .eq("active", true)
      .maybeSingle();

    if (!membership) {
      return { success: false, error: "Member not found in this account." };
    }
    let stripeAccountId = membership.payout_stripe_account_id ?? null;
    if (!stripeAccountId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", isSelfService ? user.id : requestedProfileId)
        .maybeSingle();

      if (!profile?.email) {
        return { success: false, error: "Member has no email address on file." };
      }
      const stripeAccount = await createExpressAccount(profile.email, { kind: "account", accountId });
      stripeAccountId = stripeAccount.id;
      const { error } = await admin
        .from("ownership_account_members")
        .update({ payout_stripe_account_id: stripeAccountId })
        .eq("account_id", accountId)
        .eq("profile_id", isSelfService ? user.id : requestedProfileId);

      if (error) {
        return { success: false, error: "Failed to save payout account." };
      }
    }
    const appUrl = getAppUrl();
    const encodedAccountId = encodeURIComponent(accountId);
    const payoutQuery = isSelfService
      ? `accountId=${encodedAccountId}&memberPayout=true`
      : `accountId=${encodedAccountId}&memberPayout=true&profileId=${encodeURIComponent(requestedProfileId)}`;
    const accountLink = await createAccountLink(
      stripeAccountId,
      `${appUrl}/connect/refresh?${payoutQuery}`,
      `${appUrl}/connect/return?${payoutQuery}`,
      { kind: "account", accountId }
    );

    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateMemberPayoutConnect error:", err);
    return {
      success: false,
      error: err instanceof StripeNotEligibleError ? STRIPE_CLIENT_MESSAGE : getStripeConnectOnboardingErrorCopy(err).description
    };
  }
}

export async function checkConnectStatus(accountId?: string | null): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    if (!checkRateLimit(`checkConnectStatus:${user.id}:${accountId ?? "profile"}`, 30, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    const admin = createAdminClient();

    if (accountId) {
      await assertStripeEligibleAccount(accountId);
      const { canUserAdministerOwnershipAccount } = await import("@/lib/ownership");
      const canAdministerAccount = await canUserAdministerOwnershipAccount(user.id, accountId);
      if (!canAdministerAccount) {
        return { success: false, error: "Access denied." };
      }

      const { data: ownershipAccount } = await admin
        .from("ownership_accounts")
        .select("stripe_account_id")
        .eq("id", accountId)
        .maybeSingle();

      if (!ownershipAccount?.stripe_account_id) {
        return { success: true, connected: false, detailsSubmitted: false };
      }

      const account = await getAccount(ownershipAccount.stripe_account_id);
      const connected = Boolean(account.charges_enabled && account.payouts_enabled);

      const { error } = await admin
        .from("ownership_accounts")
        .update({ stripe_onboarding_complete: connected })
        .eq("id", accountId);

      if (error) {
        return { success: false, error: "Failed to update account bank connection status." };
      }

      revalidatePath("/settings");
      revalidatePath("/owner");
      revalidatePath("/manager");

      return {
        success: true,
        connected,
        detailsSubmitted: account.details_submitted
      };
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return { success: true, connected: false, detailsSubmitted: false };
    }

    const account = await getAccount(profile.stripe_account_id);
    const connected = Boolean(account.charges_enabled && account.payouts_enabled);

    const { error } = await admin
      .from("profiles")
      .update({ stripe_onboarding_complete: connected })
      .eq("id", user.id);

    if (error) {
      return { success: false, error: "Failed to update your bank connection status." };
    }

    revalidatePath("/settings");
    revalidatePath("/owner");
    revalidatePath("/manager");

    return {
      success: true,
      connected,
      detailsSubmitted: account.details_submitted
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof StripeNotEligibleError ? STRIPE_CLIENT_MESSAGE
        : "Unable to verify your Stripe connection right now. Please try again."
    };
  }
}

export async function getExpressDashboardUrl(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const accountIdValue = formData.get("accountId");
    const requestedAccountId =
      typeof accountIdValue === "string" && accountIdValue.length > 0 ? accountIdValue : null;
    const rateLimitKey = requestedAccountId
      ? `getExpressDashboardUrl:${user.id}:${requestedAccountId}`
      : `getExpressDashboardUrl:${user.id}`;
    if (!checkRateLimit(rateLimitKey, 30, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    const admin = createAdminClient();

    if (requestedAccountId) {
      await assertStripeEligibleAccount(requestedAccountId);
      const hasAuthority = await hasRentCollectionAuthorityForAccount(user.id, requestedAccountId);
      if (!hasAuthority) {
        return { success: false, error: "Access denied." };
      }

      const { data: ownershipAccount, error: ownershipAccountError } = await admin
        .from("ownership_accounts")
        .select("stripe_account_id")
        .eq("id", requestedAccountId)
        .maybeSingle();

      if (ownershipAccountError) {
        return { success: false, error: "Unable to open Stripe right now. Please try again." };
      }
      if (!ownershipAccount?.stripe_account_id) {
        return { success: false, error: "Set up rent payments first." };
      }

      const loginLink = await createLoginLink(ownershipAccount.stripe_account_id, {
        kind: "account", accountId: requestedAccountId
      });
      return {
        success: true,
        url: loginLink.url,
        message: "Stripe dashboard link ready."
      };
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return { success: false, error: "Connect your bank account first." };
    }

    const loginLink = await createLoginLink(profile.stripe_account_id, { kind: "profile" });
    return {
      success: true,
      url: loginLink.url,
      message: "Stripe dashboard link ready."
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof StripeNotEligibleError ? STRIPE_CLIENT_MESSAGE
        : "Unable to open Stripe right now. Please try again."
    };
  }
}
