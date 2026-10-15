"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withChargeEditingFallback } from "@/lib/charge-audit";
import { isPastGraceWindow } from "@/lib/charge-generation";
import { getClientHomeFlags, tracksLateRent } from "@/lib/lease-collection";
import { canUserAdministerProperty } from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

const chargeIdSchema = z.string().uuid();
const defaultError = "We could not undo this payment.";

export async function undoManualPayment(chargeId: string): Promise<ActionState> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = chargeIdSchema.safeParse(chargeId);
  if (!parsed.success) return { success: false, error: defaultError };
  if (!checkRateLimit(`undoManualPayment:${user.id}`, 20, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  const admin = createAdminClient();
  const { data: charge, error: chargeError } = await withChargeEditingFallback(
    () => admin.from("rent_charges").select("id, lease_id, due_date, deleted_at")
      .eq("id", parsed.data).is("deleted_at", null).maybeSingle(),
    () => admin.from("rent_charges").select("id, lease_id, due_date")
      .eq("id", parsed.data).maybeSingle()
  );
  if (chargeError || !charge) return { success: false, error: defaultError };

  const { data: lease, error: leaseError } = await admin.from("leases")
    .select("id, unit_id, grace_period_days, collects_outside_domus")
    .eq("id", charge.lease_id).maybeSingle();
  if (leaseError || !lease) return { success: false, error: defaultError };
  const { data: unit, error: unitError } = await admin.from("units")
    .select("id, property_id").eq("id", lease.unit_id).maybeSingle();
  if (unitError || !unit) return { success: false, error: defaultError };
  if (!(await canUserAdministerProperty(user.id, unit.property_id))) {
    return { success: false, error: "Access denied." };
  }

  let clientHome: boolean;
  try {
    clientHome = (await getClientHomeFlags(admin, [unit.property_id])).get(unit.property_id) === true;
  } catch {
    return { success: false, error: defaultError };
  }
  const today = new Date();
  const restoreStatus = tracksLateRent({ ...lease, clientHome }) &&
    isPastGraceWindow(charge.due_date, lease.grace_period_days ?? 5, today) ? "late" : "pending";

  const { data, error } = await admin.rpc("undo_manual_payment", {
    p_charge_id: parsed.data, p_actor_id: user.id, p_restore_status: restoreStatus
  });
  if (error) return { success: false, error: defaultError };
  const result = data as { code?: string; reopened?: boolean; status?: string } | null;
  if (result?.code === "ok") {
    revalidatePath("/");
    revalidatePath("/owner");
    revalidatePath("/manager");
    const message = result.status === "paid" ? "Payment undone. Rent is still paid by another payment."
      : result.status === "waived" ? "Payment undone." : "Payment undone. This rent is open again.";
    return { success: true, message };
  }
  const errors: Record<string, string> = {
    stripe: "Undo this from where it was paid.",
    bank_feed: "Undo this from Bank.",
    legacy: "This payment is too old to undo here.",
    nothing_to_undo: "There is no payment to undo.",
    busy: "Someone else is saving this rent. Try again.",
    forbidden: "Access denied."
  };
  return { success: false, error: errors[result?.code ?? ""] ?? defaultError };
}
