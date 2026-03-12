"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeCustomer, createSetupCheckoutSession } from "@/lib/autopay";
import { getCurrentUserRole } from "@/lib/auth";
import {
  disableAutopaySchema,
  parseFormData,
  setupAutopaySchema
} from "@/lib/validations";
import type { ActionState } from "./shared";

export interface AutopayEnrollment {
  id: string;
  leaseId: string;
  propertyLabel: string;
  last4: string;
  brand: string | null;
  paymentMethodType: string;
  enabled: boolean;
  retryCount: number;
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://domusbase.com";
}

async function requireTenantUser() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRole(user.id);
  if (role !== "tenant") {
    redirect("/");
  }

  return { supabase, user };
}

export async function setupAutopay(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, user } = await requireTenantUser();
  const parsed = parseFormData(setupAutopaySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const { leaseId } = parsed.data;
  const { data: lease } = await supabase
    .from("leases")
    .select("id")
    .eq("id", leaseId)
    .eq("tenant_profile_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!lease) {
    return { success: false, error: "Lease not found for your account." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!user.email) {
    return { success: false, error: "Your account is missing an email address." };
  }

  let stripeCustomerId = profile?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const customer = await createStripeCustomer(user.email, profile?.full_name ?? user.email);
    stripeCustomerId = customer.id;

    const { error: updateError } = await admin
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);

    if (updateError) {
      return { success: false, error: "Failed to save your payment profile." };
    }
  }

  const appUrl = getAppUrl();
  const session = await createSetupCheckoutSession({
    customerId: stripeCustomerId,
    successUrl: `${appUrl}/autopay/return?session_id={CHECKOUT_SESSION_ID}&lease_id=${leaseId}`,
    cancelUrl: `${appUrl}/tenant?section=charges&autopay=cancelled`,
    metadata: {
      lease_id: leaseId,
      user_id: user.id
    }
  });

  if (!session.url) {
    return { success: false, error: "Unable to start autopay setup right now." };
  }

  redirect(session.url);
}

export async function disableAutopay(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user } = await requireTenantUser();
  const parsed = parseFormData(disableAutopaySchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const admin = createAdminClient();
  const { data: enrollment } = await admin
    .from("autopay_enrollments")
    .select("id")
    .eq("id", parsed.data.enrollmentId)
    .eq("tenant_profile_id", user.id)
    .maybeSingle();

  if (!enrollment) {
    return { success: false, error: "Autopay enrollment not found." };
  }

  const { error } = await admin
    .from("autopay_enrollments")
    .update({
      enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", enrollment.id);

  if (error) {
    return { success: false, error: "Failed to disable autopay." };
  }

  revalidatePath("/tenant");
  revalidatePath("/settings");
  return { success: true, message: "Autopay disabled." };
}

export async function getAutopayEnrollments(userId: string): Promise<AutopayEnrollment[]> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return [];
  }

  const { data: enrollments } = await supabase
    .from("autopay_enrollments")
    .select("id, lease_id, payment_method_type, last4, brand, enabled, retry_count")
    .eq("tenant_profile_id", user.id)
    .order("created_at", { ascending: true });

  const enrollmentRows = (enrollments ?? []) as Array<{
    id: string;
    lease_id: string;
    payment_method_type: string;
    last4: string;
    brand: string | null;
    enabled: boolean;
    retry_count: number;
  }>;

  if (enrollmentRows.length === 0) {
    return [];
  }

  const leaseIds = enrollmentRows.map((enrollment) => enrollment.lease_id);
  const { data: leases } = await supabase
    .from("leases")
    .select("id, unit_id")
    .in("id", leaseIds);

  const unitIds = Array.from(new Set((leases ?? []).map((lease) => lease.unit_id)));
  const { data: units } = unitIds.length
    ? await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds)
    : { data: [] as Array<{ id: string; unit_number: string; property_id: string }> };

  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));
  const { data: properties } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id, name")
        .in("id", propertyIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const leaseById = new Map((leases ?? []).map((lease) => [lease.id, lease]));
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));

  return enrollmentRows.map((enrollment) => {
    const lease = leaseById.get(enrollment.lease_id);
    const unit = lease ? unitById.get(lease.unit_id) : null;
    const property = unit ? propertyById.get(unit.property_id) : null;
    return {
      id: enrollment.id,
      leaseId: enrollment.lease_id,
      propertyLabel: property
        ? `${property.name} • Unit ${unit?.unit_number ?? "?"}`
        : "Your Rental",
      last4: enrollment.last4,
      brand: enrollment.brand,
      paymentMethodType: enrollment.payment_method_type,
      enabled: enrollment.enabled,
      retryCount: enrollment.retry_count
    };
  });
}
