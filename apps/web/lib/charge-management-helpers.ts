import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export const CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE =
  "Charge editing requires a database update. Apply the Sprint 72 migration and retry.";

type ChargeRecord = {
  id: string;
  lease_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  category: string | null;
  notes?: string | null;
  deleted_at?: string | null;
};

type ChargeContext = {
  charge: ChargeRecord;
  propertyId: string;
};

export function isValidDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export async function getChargeRecord(admin: ReturnType<typeof createAdminClient>, chargeId: string) {
  const result = await withChargeEditingFallback(
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, category, notes, deleted_at")
        .eq("id", chargeId)
        .maybeSingle(),
    () =>
      admin
        .from("rent_charges")
        .select("id, lease_id, due_date, amount_cents, status, category")
        .eq("id", chargeId)
        .maybeSingle()
  );

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      throw new Error(CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE);
    }
    throw result.error;
  }

  return (result.data ?? null) as ChargeRecord | null;
}

export async function getChargeContext(
  admin: ReturnType<typeof createAdminClient>,
  chargeId: string
): Promise<ChargeContext | null> {
  const charge = await getChargeRecord(admin, chargeId);
  if (!charge) {
    return null;
  }

  const { data: lease, error: leaseError } = await admin
    .from("leases")
    .select("id, unit_id")
    .eq("id", charge.lease_id)
    .maybeSingle();
  if (leaseError) {
    throw leaseError;
  }
  if (!lease) {
    return null;
  }

  const { data: unit, error: unitError } = await admin
    .from("units")
    .select("id, property_id")
    .eq("id", lease.unit_id)
    .maybeSingle();
  if (unitError) {
    throw unitError;
  }
  if (!unit) {
    return null;
  }

  return {
    charge,
    propertyId: unit.property_id
  };
}

export async function insertChargeHistory(
  admin: ReturnType<typeof createAdminClient>,
  entries: Array<{
    charge_id: string;
    edited_by: string;
    field_name: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
  }>
) {
  if (entries.length === 0) {
    return;
  }

  const { error } = await admin.from("charge_edit_history").insert(entries);
  if (error) {
    if (isMissingSchemaError(error)) {
      throw new Error(CHARGE_EDITING_REQUIRES_UPDATE_MESSAGE);
    }
    throw error;
  }
}

export function revalidateChargeSurfaces() {
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/owner/reports");
}
