"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole } from "@/lib/auth";
import { canUserAdministerProperty } from "@/lib/property-access";
import { logAudit } from "@/lib/audit";
import {
  createAccountLink,
  createExpressAccount,
  createLoginLink,
  getAccount
} from "@/lib/stripe-connect";
import { parseFormData, updateManagementFeeSchema } from "@/lib/validations";
import type { ActionState } from "./shared";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
}

async function requireConnectedRole() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner" && role !== "manager") {
    redirect("/");
  }

  return { user, role };
}

export async function initiateStripeConnect(): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
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

export async function checkConnectStatus(): Promise<ActionState> {
  try {
    const { user } = await requireConnectedRole();
    const admin = createAdminClient();

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
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "owner") {
    return { success: false, error: "Unauthorized." };
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

  const managementFeeCents = Math.round(managementFeeDollars * 100);
  const { error } = await supabase
    .from("properties")
    .update({ management_fee_cents: managementFeeCents })
    .eq("id", propertyId);

  if (error) {
    return { success: false, error: "Failed to update management fee." };
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
  }).catch(() => {});

  revalidatePath("/owner");
  revalidatePath("/manager");
  return { success: true, message: "Management fee updated." };
}
