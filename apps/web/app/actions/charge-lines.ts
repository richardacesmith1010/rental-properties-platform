"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUserAdministerProperty } from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import {
  createNextBillLineSchema, deleteNextBillLineSchema, billTenantForExpenseSchema
} from "@/lib/validations-payment";
import { requireAuth } from "./auth-helpers";

type Result = { ok: boolean; error?: string; auditWarning?: boolean; lineId?: string };
const databaseError = { ok: false, error: "This feature requires a database update" };
const failed = { ok: false, error: "Could not update the next bill. Try again." };

async function leaseProperty(admin: ReturnType<typeof createAdminClient>, leaseId: string) {
  const { data: lease, error: leaseError } = await admin.from("leases")
    .select("id, unit_id, monthly_rent_cents").eq("id", leaseId).maybeSingle();
  if (leaseError) throw leaseError;
  if (!lease) return null;
  const { data: unit, error: unitError } = await admin.from("units")
    .select("property_id").eq("id", lease.unit_id).maybeSingle();
  if (unitError) throw unitError;
  return unit ? { propertyId: unit.property_id, rentCents: lease.monthly_rent_cents } : null;
}

async function audit(admin: ReturnType<typeof createAdminClient>, userId: string,
  action: string, lineId: string, propertyId: string): Promise<boolean> {
  try {
    const { error } = await admin.from("audit_logs").insert({
      user_id: userId, action, entity_type: "rent_charge_line", entity_id: lineId,
      metadata: { propertyId }
    });
    if (!error) return false;
    console.error("[charge-line-audit-failed]", error);
    return true;
  } catch (error) {
    console.error("[charge-line-audit-failed]", error);
    return true;
  }
}

function refresh() {
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/owner/reports");
}

export async function addNextBillLine(input: unknown): Promise<Result> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = createNextBillLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid line." };
  const { leaseId, kind, label, amountCents } = parsed.data;
  const admin = createAdminClient();
  try {
    const context = await leaseProperty(admin, leaseId);
    if (!context || !(await canUserAdministerProperty(user.id, context.propertyId))) {
      return { ok: false, error: "Access denied." };
    }
    if (kind === "credit" && amountCents >= context.rentCents) {
      return { ok: false, error: "That credit is bigger than the rent." };
    }
    const { data, error } = await admin.rpc("add_rent_charge_line", {
      p_lease_id: leaseId, p_kind: kind, p_label: label,
      p_amount_cents: kind === "credit" ? -amountCents : amountCents,
      p_source_expense_id: null, p_actor_profile_id: user.id
    });
    if (error) throw error;
    const auditWarning = await audit(admin, user.id, "add_rent_charge_line", data, context.propertyId);
    refresh();
    return { ok: true, lineId: data, auditWarning };
  } catch (error) {
    console.error("[charge-line-add-failed]", error);
    return isMissingSchemaError(error) ? databaseError : failed;
  }
}

export async function removeNextBillLine(input: unknown): Promise<Result> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = deleteNextBillLineSchema.safeParse({ lineId: input });
  if (!parsed.success) return { ok: false, error: "Invalid line." };
  const admin = createAdminClient();
  try {
    const { data: line, error: lineError } = await admin.from("rent_charge_lines")
      .select("id, lease_id, charge_id").eq("id", parsed.data.lineId).maybeSingle();
    if (lineError) throw lineError;
    if (!line) return { ok: false, error: "Line not found." };
    const context = await leaseProperty(admin, line.lease_id);
    if (!context || !(await canUserAdministerProperty(user.id, context.propertyId))) {
      return { ok: false, error: "Access denied." };
    }
    const attachedError = "This line is already on a bill. Add a credit to the next bill instead.";
    if (line.charge_id) return { ok: false, error: attachedError };
    const { error } = await admin.rpc("remove_rent_charge_line", {
      p_line_id: line.id, p_actor_profile_id: user.id
    });
    if (error?.message.includes("line_attached")) return { ok: false, error: attachedError };
    if (error) throw error;
    const auditWarning = await audit(admin, user.id, "remove_rent_charge_line", line.id, context.propertyId);
    refresh();
    return { ok: true, auditWarning };
  } catch (error) {
    console.error("[charge-line-remove-failed]", error);
    return isMissingSchemaError(error) ? databaseError : failed;
  }
}

export async function billTenantForExpense(input: unknown): Promise<Result> {
  const { user } = await requireAuth("owner", "manager");
  const parsed = billTenantForExpenseSchema.safeParse({ expenseId: input });
  if (!parsed.success) return { ok: false, error: "Invalid bill." };
  const admin = createAdminClient();
  try {
    const { data: expense, error: expenseError } = await admin.from("property_expenses")
      .select("id, property_id, category, description, amount_cents")
      .eq("id", parsed.data.expenseId).maybeSingle();
    if (expenseError) throw expenseError;
    if (!expense || !(await canUserAdministerProperty(user.id, expense.property_id))) {
      return { ok: false, error: "Access denied." };
    }
    if (expense.category !== "utility") return { ok: false, error: "Only utility bills can be billed to a tenant." };
    const { data: units, error: unitsError } = await admin.from("units")
      .select("id").eq("property_id", expense.property_id);
    if (unitsError) throw unitsError;
    const unitIds = (units ?? []).map((unit) => unit.id);
    const { data: leases, error: leasesError } = unitIds.length
      ? await admin.from("leases").select("id").in("unit_id", unitIds).eq("active", true)
      : { data: [], error: null };
    if (leasesError) throw leasesError;
    if (!leases?.length) return { ok: false, error: "This home has no active lease." };
    if (leases.length > 1) return {
      ok: false, error: "This home has more than one lease. Use Add to next bill on the Rent list."
    };
    const { data, error } = await admin.rpc("add_rent_charge_line", {
      p_lease_id: leases[0].id, p_kind: "utility",
      p_label: /water/i.test(expense.description ?? "") ? "Water" : "Utilities",
      p_amount_cents: expense.amount_cents, p_source_expense_id: expense.id,
      p_actor_profile_id: user.id
    });
    if (error) throw error;
    const auditWarning = await audit(admin, user.id, "add_rent_charge_line", data, expense.property_id);
    refresh();
    return { ok: true, lineId: data, auditWarning };
  } catch (error) {
    console.error("[charge-line-expense-failed]", error);
    return isMissingSchemaError(error) ? databaseError : failed;
  }
}
