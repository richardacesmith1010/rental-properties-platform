import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminClient = ReturnType<typeof createAdminClient>;

export type Match = {
  column: "stripe_checkout_session_id" | "stripe_payment_intent_id";
  value: string;
};

export interface Ctx {
  charge: { id: string; lease_id: string; status: string; due_date: string; amount_cents: number };
  lease: { id: string; tenant_profile_id: string | null; unit_id: string; collects_outside_domus: boolean | null };
  unit: { id: string; property_id: string; unit_number: string };
  property: { id: string; owner_account_id: string | null; name: string };
  tenantProfile: { id: string; email: string | null } | null;
}

export type CtxResult =
  | { ok: true; ctx: Ctx }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "db_error"; error: unknown };

export interface PaymentParams {
  supabase: AdminClient;
  chargeId: string;
  userId: string;
  amountCents: number;
  paymentMatch: Match;
  method: string;
  referenceNote: string | null;
  transferGroup: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  requireAuthorizedUser?: boolean;
  resetAutopay?: boolean;
  transferMode?: string | null;
  baseAmountCents?: number | null;
  managerFeeCents?: number | null;
}

export function received(status?: string) {
  return NextResponse.json(status ? { received: true, status } : { received: true });
}

export function retryableWebhookError(error: string) {
  return new NextResponse(JSON.stringify({ error }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

export function isConstraintViolation(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "23514" ||
        error.message?.toLowerCase().includes("check constraint") === true)
  );
}

export async function getCtx(supabase: AdminClient, chargeId: string): Promise<CtxResult> {
  const { data: charge, error: chargeError } = await supabase
    .from("rent_charges")
    .select("id, lease_id, status, due_date, amount_cents")
    .eq("id", chargeId)
    .maybeSingle();
  if (chargeError) {
    console.error("[stripe-webhook] getCtx charge query failed:", chargeError);
    return { ok: false, reason: "db_error", error: chargeError };
  }
  if (!charge) {
    return { ok: false, reason: "not_found" };
  }

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("id, tenant_profile_id, unit_id, collects_outside_domus")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (leaseError) {
    console.error("[stripe-webhook] getCtx lease query failed:", leaseError);
    return { ok: false, reason: "db_error", error: leaseError };
  }
  if (!lease) {
    return { ok: false, reason: "not_found" };
  }

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, property_id, unit_number")
    .eq("id", lease.unit_id)
    .maybeSingle();
  if (unitError) {
    console.error("[stripe-webhook] getCtx unit query failed:", unitError);
    return { ok: false, reason: "db_error", error: unitError };
  }
  if (!unit) {
    return { ok: false, reason: "not_found" };
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, owner_account_id, name")
    .eq("id", unit.property_id)
    .maybeSingle();
  if (propertyError) {
    console.error("[stripe-webhook] getCtx property query failed:", propertyError);
    return { ok: false, reason: "db_error", error: propertyError };
  }
  if (!property) {
    return { ok: false, reason: "not_found" };
  }

  const { data: tenantProfile, error: tenantProfileError } = lease.tenant_profile_id
    ? await supabase
        .from("profiles")
        .select("id, email")
        .eq("id", lease.tenant_profile_id)
        .maybeSingle()
    : { data: null, error: null };
  if (tenantProfileError) {
    console.error(`[stripe-webhook] getCtx tenant_profile: ${tenantProfileError.code ?? "unknown"}`);
    return { ok: false, reason: "db_error", error: tenantProfileError };
  }

  return { ok: true, ctx: { charge, lease, unit, property, tenantProfile } };
}

export async function isAuthorizedUser(supabase: AdminClient, ctx: Ctx, userId: string) {
  const [{ data: ownerMembership }, { data: managerAssignment }] = await Promise.all([
    ctx.property.owner_account_id
      ? supabase
          .from("ownership_account_members")
          .select("account_id")
          .eq("account_id", ctx.property.owner_account_id)
          .eq("profile_id", userId)
          .eq("member_role", "owner")
          .eq("active", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("property_managers")
      .select("property_id")
      .eq("property_id", ctx.property.id)
      .eq("manager_profile_id", userId)
      .eq("active", true)
      .maybeSingle()
  ]);

  return Boolean(ownerMembership?.account_id) || Boolean(managerAssignment?.property_id) || ctx.lease.tenant_profile_id === userId;
}
