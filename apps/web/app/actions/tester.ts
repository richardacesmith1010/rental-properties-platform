"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserRole, isTester as hasTesterAccess } from "@/lib/auth";
import { getOrCreateIndividualOwnershipAccount } from "@/lib/ownership";
import {
  grantTesterAccessSchema,
  revokeTesterAccessSchema,
  parseFormData
} from "@/lib/validations";
import { isMissingSchemaError, type ActionState } from "./shared";

export async function generateTesterData(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await hasTesterAccess(user.id))) {
    return { success: false, error: "Tester access is required." };
  }

  const admin = createAdminClient();
  const ownerAccountId = await getOrCreateIndividualOwnershipAccount(user.id);
  const stamp = Date.now();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      owner_profile_id: user.id,
      owner_account_id: ownerAccountId,
      name: `TESTER Property ${stamp}`,
      address_line1: `${100 + (stamp % 900)} Tester Ave`,
      city: "Denver",
      state: "CO",
      postal_code: "80202"
    })
    .select("id")
    .single();

  if (propertyError || !property) {
    return { success: false, error: "Failed to create tester property." };
  }

  const { data: unit, error: unitError } = await admin
    .from("units")
    .insert({
      property_id: property.id,
      unit_number: `TESTER-${String(stamp).slice(-4)}`,
      bedrooms: 3,
      bathrooms: 2,
      monthly_rent_cents: 245000,
      occupied: false
    })
    .select("id")
    .single();

  if (unitError || !unit) {
    return { success: false, error: "Failed to create tester unit." };
  }

  const tenantProfileId = crypto.randomUUID();
  const { error: tenantError } = await admin
    .from("profiles")
    .insert({
      id: tenantProfileId,
      email: `tester+${stamp}@domus.local`,
      full_name: `Tester Tenant ${String(stamp).slice(-4)}`,
      role: "tenant"
    });

  if (tenantError) {
    return { success: false, error: "Failed to create tester tenant profile." };
  }

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(startDate.getFullYear() + 1);

  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .insert({
      unit_id: unit.id,
      tenant_profile_id: tenantProfileId,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      due_day_of_month: 1,
      monthly_rent_cents: 245000,
      deposit_cents: 245000,
      active: true
    })
    .select("id")
    .single();

  if (leaseError || !lease) {
    return { success: false, error: "Failed to create tester lease." };
  }

  await admin.from("units").update({ occupied: true }).eq("id", unit.id);

  const thisMonthDue = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const lastMonthDue = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);

  const { error: chargesError } = await admin.from("rent_charges").insert([
    {
      lease_id: lease.id,
      due_date: thisMonthDue,
      amount_cents: 245000,
      status: "pending"
    },
    {
      lease_id: lease.id,
      due_date: lastMonthDue,
      amount_cents: 245000,
      status: "late"
    }
  ]);

  if (chargesError) {
    return { success: false, error: "Tester data created, but charge generation failed." };
  }

  revalidatePath("/owner");
  revalidatePath("/tester");
  return {
    success: true,
    message: `Created tester data: 1 property, 1 unit, 1 tenant lease, and 2 rent charges.`
  };
}

export async function cleanupTesterData(
  _prev: ActionState,
  _formData: FormData
): Promise<ActionState> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await hasTesterAccess(user.id))) {
    return { success: false, error: "Tester access is required." };
  }

  const admin = createAdminClient();
  const { data: properties } = await admin
    .from("properties")
    .select("id")
    .eq("owner_profile_id", user.id)
    .ilike("name", "TESTER Property%");

  const propertyIds = (properties ?? []).map((property) => property.id);
  if (propertyIds.length === 0) {
    return {
      success: true,
      message: "No tester data was found to archive."
    };
  }

  const { data: units } = await admin
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  const unitIds = (units ?? []).map((unit) => unit.id);
  const { data: leases } = unitIds.length
    ? await admin
        .from("leases")
        .select("id")
        .in("unit_id", unitIds)
    : { data: [] as Array<{ id: string }> };

  const leaseIds = (leases ?? []).map((lease) => lease.id);

  if (leaseIds.length > 0) {
    await admin
      .from("leases")
      .update({ active: false })
      .in("id", leaseIds);
  }

  if (unitIds.length > 0) {
    const unitArchive = await admin
      .from("units")
      .update({ occupied: false, active: false })
      .in("id", unitIds);

    if (unitArchive.error && await isMissingSchemaError(unitArchive.error)) {
      await admin
        .from("units")
        .update({ occupied: false })
        .in("id", unitIds);
    }
  }

  const propertyArchive = await admin
    .from("properties")
    .update({ active: false })
    .in("id", propertyIds);

  if (propertyArchive.error && await isMissingSchemaError(propertyArchive.error)) {
    // Legacy environments may not yet have the soft-delete column.
  }

  revalidatePath("/owner");
  revalidatePath("/tester");
  return {
    success: true,
    message: `Archived tester data for ${propertyIds.length} properties, ${unitIds.length} units, and ${leaseIds.length} leases.`
  };
}

export async function grantTesterAccess(
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
  if (role !== "owner" || !(await hasTesterAccess(user.id))) {
    return { success: false, error: "Only owner tester accounts can grant tester access." };
  }

  const parsed = parseFormData(grantTesterAccessSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const admin = createAdminClient();

  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email, is_tester")
    .ilike("email", normalizedEmail)
    .single();

  if (profileLookupError || !profile) {
    return {
      success: false,
      error: "No profile found for that email. They need to sign in at least once first."
    };
  }

  if (profile.is_tester) {
    return { success: true, message: `${profile.email} already has tester access.` };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_tester: true })
    .eq("id", profile.id);

  if (updateError) {
    return { success: false, error: "Failed to grant tester access." };
  }

  revalidatePath("/tester");
  revalidatePath("/owner");
  return { success: true, message: `Granted tester access to ${profile.email}.` };
}

export async function revokeTesterAccess(
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
  if (role !== "owner" || !(await hasTesterAccess(user.id))) {
    return { success: false, error: "Only owner tester accounts can revoke tester access." };
  }

  const parsed = parseFormData(revokeTesterAccessSchema, formData);
  if (!parsed.success) {
    return parsed;
  }

  if (parsed.data.profileId === user.id) {
    return {
      success: false,
      error: "You cannot revoke your own tester access from this page."
    };
  }

  const admin = createAdminClient();
  const { data: profile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email, is_tester")
    .eq("id", parsed.data.profileId)
    .single();

  if (profileLookupError || !profile) {
    return { success: false, error: "Tester profile not found." };
  }

  if (!profile.is_tester) {
    return { success: true, message: `${profile.email} is already not a tester.` };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ is_tester: false })
    .eq("id", profile.id);

  if (updateError) {
    return { success: false, error: "Failed to revoke tester access." };
  }

  revalidatePath("/tester");
  return { success: true, message: `Revoked tester access for ${profile.email}.` };
}
