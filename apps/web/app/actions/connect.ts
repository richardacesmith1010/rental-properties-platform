"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import { sideEffectError } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  createAccountLink,
  createExpressAccount,
  createLoginLink,
  getAccount
} from "@/lib/stripe-connect";
import { parseFormData, updateManagementFeeSchema } from "@/lib/validations";
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
      const account = await createExpressAccount(user.email);
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
      stripeAccountId,
      `${appUrl}/connect/refresh`,
      `${appUrl}/connect/return`
    );

    return {
      success: true,
      url: accountLink.url
    };
  } catch (err) {
    console.error("initiateStripeConnect error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unable to start Stripe onboarding right now. (${detail})`
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

      const stripeAccount = await createExpressAccount(user.email);
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
    const accountLink = await createAccountLink(
      stripeAccountId,
      `${appUrl}/connect/refresh?accountId=${encodeURIComponent(accountId)}`,
      `${appUrl}/connect/return?accountId=${encodeURIComponent(accountId)}`
    );

    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateAccountStripeConnect error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unable to start Stripe onboarding. (${detail})`
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

    const requestedProfileId =
      typeof profileId === "string" && profileId.length > 0 ? profileId : user.id;
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

      const stripeAccount = await createExpressAccount(profile.email);
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
      `${appUrl}/connect/return?${payoutQuery}`
    );

    return { success: true, url: accountLink.url };
  } catch (err) {
    console.error("initiateMemberPayoutConnect error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Unable to start payout onboarding. (${detail})`
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
  } catch {
    return {
      success: false,
      error: "Unable to verify your Stripe connection right now. Please try again."
    };
  }
}

export async function getExpressDashboardUrl(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    if (!checkRateLimit(`getExpressDashboardUrl:${user.id}`, 30, 60_000).allowed) {
      return { success: false, error: "Too many requests. Please try again later." };
    }
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.stripe_account_id) {
      return { success: false, error: "Connect your bank account first." };
    }

    const loginLink = await createLoginLink(profile.stripe_account_id);
    return {
      success: true,
      url: loginLink.url,
      message: "Stripe dashboard link ready."
    };
  } catch {
    return {
      success: false,
      error: "Unable to open Stripe right now. Please try again."
    };
  }
}

export async function updateManagementFee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireAuth("owner");
  if (!checkRateLimit(`updateManagementFee:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const parsed = parseFormData(updateManagementFeeSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { propertyId, managementFeeDollars } = parsed.data;
  const canAdminister = await canUserAdministerProperty(user.id, propertyId);
  if (!canAdminister) {
    return { success: false, error: "Access denied." };
  }

  const admin = createAdminClient();
  const { data: units, error: unitsError } = await admin
    .from("units")
    .select("monthly_rent_cents")
    .eq("property_id", propertyId)
    .order("monthly_rent_cents", { ascending: false })
    .limit(1);

  if (unitsError) {
    return { success: false, error: "Unable to validate the management fee for this property." };
  }

  const highestRentCents = units?.[0]?.monthly_rent_cents ?? 0;
  const managementFeeCents = Math.round(managementFeeDollars * 100);
  if (highestRentCents > 0 && managementFeeCents > highestRentCents) {
    return {
      success: false,
      error: `Management fee ($${managementFeeDollars.toFixed(2)}) cannot exceed the highest unit rent ($${(highestRentCents / 100).toFixed(2)}).`
    };
  }

  const { data: activeConfig, error: activeConfigError } = await admin.from("manager_payment_configs")
    .select("manager_profile_id, frequency")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeConfigError) {
    return { success: false, error: isMissingSchemaError(activeConfigError) ? "This feature requires a database update." : "Failed to update management fee." };
  }

  let managerProfileId = activeConfig?.manager_profile_id ?? null;
  if (!managerProfileId && managementFeeCents > 0) {
    const { data: latestManager, error: latestManagerError } = await admin.from("property_managers")
      .select("manager_profile_id")
      .eq("property_id", propertyId)
      .eq("active", true)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestManagerError) {
      return { success: false, error: isMissingSchemaError(latestManagerError) ? "This feature requires a database update." : "Failed to update management fee." };
    }

    managerProfileId = latestManager?.manager_profile_id ?? null;
  }

  if (!managerProfileId && managementFeeCents > 0) {
    return { success: false, error: "Assign an active manager to this property before setting a management fee." };
  }

  if (managerProfileId) {
    const { error } = await supabase.from("manager_payment_configs")
      .upsert({
        property_id: propertyId,
        manager_profile_id: managerProfileId,
        payment_type: "flat",
        percentage_rate: null,
        flat_amount_cents: managementFeeCents,
        base_rent_cents: null,
        label: "Property Management Fee",
        frequency: activeConfig?.frequency ?? "monthly",
        active: managementFeeCents > 0,
        updated_at: new Date().toISOString()
      }, { onConflict: "property_id,manager_profile_id" });

    if (error) {
      return { success: false, error: isMissingSchemaError(error) ? "This feature requires a database update." : "Failed to update management fee." };
    }
  }

  void logAudit({
    userId: user.id,
    action: "update_management_fee",
    entityType: "property",
    entityId: propertyId,
    metadata: {
      propertyId,
      managementFeeCents
    }
  }).catch(
    sideEffectError("updateManagementFee", "log_audit", {
      userId: user.id,
      entityType: "property",
      entityId: propertyId
    })
  );

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Management fee updated." };
}
