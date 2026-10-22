"use server";

import { todayDenver } from "@/lib/denver-calendar";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { createDepositReturnSchema, deleteDepositReturnSchema } from "@/lib/validations";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";

type Result = { ok: boolean; error?: string };

async function authorizeLease(leaseId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const lease = await admin.from("leases").select("unit_id").eq("id", leaseId).maybeSingle();
  if (lease.error || !lease.data) return false;
  const unit = await admin.from("units").select("property_id").eq("id", lease.data.unit_id).maybeSingle();
  if (unit.error || !unit.data) return false;
  return canUserAdministerProperty(userId, unit.data.property_id);
}

export async function recordDepositReturn(input: {
  leaseId: string; returnedCents: number; returnedOn: string
}): Promise<Result> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = createDepositReturnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount and date." };
  if (parsed.data.returnedOn > todayDenver()) {
    return { ok: false, error: "The return date cannot be in the future." };
  }
  if (!(await authorizeLease(parsed.data.leaseId, user.id))) return { ok: false, error: "Access denied." };
  const admin = createAdminClient();
  const lease = await admin.from("leases").select("deposit_cents").eq("id", parsed.data.leaseId).single();
  if (lease.error || !lease.data) return { ok: false, error: "Lease not found." };
  if (parsed.data.returnedCents > lease.data.deposit_cents) {
    return { ok: false, error: "Amount returned cannot exceed the deposit." };
  }
  const result = await admin.rpc("record_deposit_return", { p_lease_id: parsed.data.leaseId,
    p_returned_cents: parsed.data.returnedCents, p_returned_on: parsed.data.returnedOn,
    p_actor_profile_id: user.id });
  if (result.error) return { ok: false, error: isMissingSchemaError(result.error)
    ? "This feature requires a database update." : "Could not record the deposit return." };
  if (result.data === "already") return { ok: false,
    error: "This deposit return is already recorded. Undo it first." };
  revalidatePath("/owner"); revalidatePath("/owner/money"); revalidatePath("/manager");
  return { ok: true };
}

export async function clearDepositReturn(leaseId: string): Promise<Result> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = deleteDepositReturnSchema.safeParse({ leaseId });
  if (!parsed.success) return { ok: false, error: "Lease not found." };
  if (!(await authorizeLease(leaseId, user.id))) return { ok: false, error: "Access denied." };
  const result = await createAdminClient().rpc("clear_deposit_return", {
    p_lease_id: leaseId, p_actor_profile_id: user.id });
  if (result.error) return { ok: false, error: isMissingSchemaError(result.error)
    ? "This feature requires a database update." : "Could not undo the deposit return." };
  revalidatePath("/owner"); revalidatePath("/owner/money"); revalidatePath("/manager");
  return { ok: true };
}
