"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import { unique, selectRows, loadDeletionScope } from "@/lib/account-wipe/scope";
import {
  createWipePlan, applyWipePlan, deleteDistributionRecords,
  deleteLeaseFinancials, deleteLeasingPipeline, deleteDocuments,
  deleteMaintenance, deleteAutomation
} from "@/lib/account-wipe/mutations";

interface AuthContext {
  userId: string;
  email: string | null;
}

type WipeAuthResult = AuthContext | { success: false; error: string };

async function requireOwnerForWipe(action: string): Promise<WipeAuthResult> {
  const { user, role } = await requireAuth("owner", "manager", "tenant");
  if (role !== "owner") {
    return { success: false, error: "Only owners can perform this action." };
  }

  if (!checkRateLimit(`${action}:${user.id}`, 5, 60_000).allowed) {
    return { success: false, error: "Too many requests. Please try again later." };
  }

  return { userId: user.id, email: user.email ?? null };
}

function requireDeleteConfirmation(formData: FormData): ActionState | null {
  const confirmation = formData.get("confirmation");
  if (confirmation !== "DELETE") {
    return { success: false, error: 'Type "DELETE" to confirm this action.' };
  }
  return null;
}

async function revalidateSettingsSurfaces() {
  revalidatePath("/settings");
  revalidatePath("/owner");
  revalidatePath("/manager");
  revalidatePath("/tenant");
}

export async function deleteAllProperties(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("deleteAllProperties");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const scope = await loadDeletionScope(auth.userId);
    const plan = createWipePlan("deleteAllProperties");
    deleteLeaseFinancials(plan, scope);
    deleteMaintenance(plan, scope);
    deleteDocuments(plan, scope, false);
    deleteLeasingPipeline(plan, scope);
    deleteAutomation(plan, scope);
    plan.deleteIn("manager_payments", "property_id", scope.propertyIds, "Delete manager payments");
    plan.deleteIn("manager_payment_configs", "property_id", scope.propertyIds, "Delete manager payment configs");
    plan.deleteIn("property_expenses", "id", scope.expenseIds, "Delete expenses");
    plan.deleteIn("preventive_maintenance_schedules", "property_id", scope.propertyIds,
      "Delete property maintenance schedules");
    plan.deleteIn("vendors", "id", scope.vendorIds, "Delete vendors");
    plan.deleteIn("notification_deliveries", "notification_id", scope.propertyNotificationIds, "Delete property notification deliveries");
    plan.deleteIn("notifications", "id", scope.propertyNotificationIds, "Delete property notifications");
    plan.deleteIn("message_deliveries", "message_id", scope.propertyMessageIds, "Delete property message deliveries");
    plan.deleteIn("inbox_messages", "id", scope.propertyMessageIds, "Delete property inbox messages");
    plan.deleteIn("inbox_threads", "id", scope.propertyThreadIds, "Delete property inbox threads");
    plan.deleteIn("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    plan.deleteIn("invitations", "id", scope.invitationIds, "Delete invitations");
    plan.deleteIn("inspections", "lease_id", scope.leaseIds, "Delete lease inspections");
    plan.deleteIn("documents", "lease_id", scope.leaseIds, "Delete lease documents");
    plan.deleteIn("leases", "id", scope.leaseIds, "Delete leases");
    plan.deleteIn("documents", "unit_id", scope.unitIds, "Delete unit documents");
    plan.deleteIn("communication_logs", "unit_id", scope.unitIds, "Delete unit communication logs");
    plan.deleteIn("units", "id", scope.unitIds, "Delete units");
    plan.deleteIn("documents", "property_id", scope.propertyIds, "Delete property documents");
    plan.deleteIn("communication_logs", "property_id", scope.propertyIds, "Delete property communication logs");
    plan.deleteIn("properties", "id", scope.propertyIds, "Delete properties");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "All properties and related operational data have been removed." };
  } catch (error) {
    console.error("deleteAllProperties error:", error);
    return { success: false, error: "Unable to delete property data right now." };
  }
}

export async function deleteAllTenants(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("deleteAllTenants");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const admin = createAdminClient();
    const scope = await loadDeletionScope(auth.userId);
    const tenantLeaseRows = await selectRows<{ id: string; unit_id: string; tenant_profile_id: string | null }>(
      scope.unitIds.length
        ? admin
            .from("leases")
            .select("id, unit_id, tenant_profile_id")
            .in("unit_id", scope.unitIds)
        : Promise.resolve({ data: [], error: null }),
      "Load tenant leases"
    );
    const tenantLeaseIds = tenantLeaseRows
      .filter((lease) => Boolean(lease.tenant_profile_id))
      .map((lease) => lease.id);
    const tenantUnitIds = unique(tenantLeaseRows.filter((lease) => Boolean(lease.tenant_profile_id)).map((lease) => lease.unit_id));
    const chargeRows = await selectRows<{ id: string }>(
      tenantLeaseIds.length
        ? admin.from("rent_charges").select("id").in("lease_id", tenantLeaseIds)
        : Promise.resolve({ data: [], error: null }),
      "Load tenant rent charges"
    );
    const chargeIds = chargeRows.map((charge) => charge.id);
    const paymentRows = await selectRows<{ id: string }>(
      chargeIds.length
        ? admin.from("payments").select("id").in("rent_charge_id", chargeIds)
        : Promise.resolve({ data: [], error: null }),
      "Load tenant payments"
    );
    const packetRows = await selectRows<{ id: string }>(
      tenantLeaseIds.length
        ? admin.from("document_packets").select("id").in("lease_id", tenantLeaseIds)
        : Promise.resolve({ data: [], error: null }),
      "Load tenant document packets"
    );

    const plan = createWipePlan("deleteAllTenants");
    plan.deleteIn("payment_distributions", "payment_id", paymentRows.map((payment) => payment.id), "Delete tenant payment distributions");
    plan.deleteIn("payments", "id", paymentRows.map((payment) => payment.id), "Delete tenant payments");
    plan.deleteIn("rent_charges", "id", chargeIds, "Delete tenant rent charges");
    plan.deleteIn("autopay_enrollments", "lease_id", tenantLeaseIds, "Delete tenant autopay enrollments");
    plan.deleteIn("document_signers", "packet_id", packetRows.map((packet) => packet.id), "Delete tenant document signers");
    plan.deleteIn("document_packets", "id", packetRows.map((packet) => packet.id), "Delete tenant document packets");
    plan.deleteWhere("maintenance_tickets", [
      { op: "in", column: "property_id", values: scope.propertyIds },
      { op: "not_null", column: "tenant_profile_id" }
    ], "Delete tenant maintenance tickets");
    plan.deleteWhere("invitations", [
      { op: "eq", column: "role", value: "tenant" },
      { op: "in", column: "property_id", values: scope.propertyIds }
    ], "Delete tenant invitations");
    plan.deleteIn("inspections", "lease_id", tenantLeaseIds, "Delete lease inspections");
    plan.deleteIn("documents", "lease_id", tenantLeaseIds, "Delete lease documents");
    plan.deleteIn("leases", "id", tenantLeaseIds, "Delete tenant leases");
    plan.updateIn("units", { occupied: false }, "id", tenantUnitIds, "Reset unit occupancy");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "All tenant-linked data has been removed." };
  } catch (error) {
    console.error("deleteAllTenants error:", error);
    return { success: false, error: "Unable to remove tenant data right now." };
  }
}

export async function deleteAllManagers(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("deleteAllManagers");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const scope = await loadDeletionScope(auth.userId);
    const plan = createWipePlan("deleteAllManagers");
    plan.deleteIn("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    plan.deleteWhere("invitations", [
      { op: "eq", column: "role", value: "manager" },
      { op: "in", column: "property_id", values: scope.propertyIds }
    ], "Delete manager invitations");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "All property manager assignments and invites have been removed." };
  } catch (error) {
    console.error("deleteAllManagers error:", error);
    return { success: false, error: "Unable to remove manager data right now." };
  }
}

export async function deleteAllLeases(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("deleteAllLeases");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const admin = createAdminClient();
    const scope = await loadDeletionScope(auth.userId);
    const packetRows = await selectRows<{ id: string }>(
      scope.leaseIds.length
        ? admin.from("document_packets").select("id").in("lease_id", scope.leaseIds)
        : Promise.resolve({ data: [], error: null }),
      "Load lease document packets"
    );
    const plan = createWipePlan("deleteAllLeases");
    deleteLeaseFinancials(plan, scope);
    plan.deleteIn("document_signers", "packet_id", packetRows.map((packet) => packet.id), "Delete lease document signers");
    plan.deleteIn("document_packets", "id", packetRows.map((packet) => packet.id), "Delete lease document packets");
    plan.deleteIn("inspections", "lease_id", scope.leaseIds, "Delete lease inspections");
    plan.deleteIn("documents", "lease_id", scope.leaseIds, "Delete lease documents");
    plan.deleteIn("leases", "id", scope.leaseIds, "Delete leases");
    plan.updateIn("units", { occupied: false }, "id", scope.unitIds, "Reset occupied units");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "All leases and rent schedules have been removed." };
  } catch (error) {
    console.error("deleteAllLeases error:", error);
    return { success: false, error: "Unable to delete lease data right now." };
  }
}

export async function deleteAllFinancialData(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("deleteAllFinancialData");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const scope = await loadDeletionScope(auth.userId);
    const plan = createWipePlan("deleteAllFinancialData");
    deleteDistributionRecords(plan, scope);
    plan.deleteIn("payments", "id", scope.paymentIds, "Delete payments");
    plan.deleteIn("rent_charges", "id", scope.chargeIds, "Delete rent charges");
    plan.deleteIn("property_expenses", "property_id", scope.propertyIds, "Delete expenses");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "All financial records have been cleared." };
  } catch (error) {
    console.error("deleteAllFinancialData error:", error);
    return { success: false, error: "Unable to delete financial data right now." };
  }
}

export async function fullAccountWipe(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await requireOwnerForWipe("fullAccountWipe");
  if ("error" in auth) {
    return auth;
  }

  const confirmationError = requireDeleteConfirmation(formData);
  if (confirmationError) {
    return confirmationError;
  }

  try {
    const admin = createAdminClient();
    const scope = await loadDeletionScope(auth.userId);
    const requestIds = await Promise.all([
      ["withdrawal_requests", "Load withdrawal requests"],
      ["distribution_change_requests", "Load distribution change requests"],
      ["account_rename_requests", "Load account rename requests"],
      ["account_delete_requests", "Load account delete requests"]
    ].map(async ([table, label]) => {
      const found = await selectRows<{ id: string }>(
        scope.accountIds.length
          ? admin.from(table).select("id").in("ownership_account_id", scope.accountIds)
          : Promise.resolve({ data: [], error: null }),
        label
      );
      return found.map((row) => row.id);
    }));

    const plan = createWipePlan("fullAccountWipe");
    deleteLeaseFinancials(plan, scope);
    deleteMaintenance(plan, scope);
    plan.deleteIn("property_expenses", "property_id", scope.propertyIds, "Delete expenses");
    deleteDocuments(plan, scope, true);
    deleteLeasingPipeline(plan, scope);
    deleteAutomation(plan, scope);
    plan.deleteIn("preventive_maintenance_schedules", "property_id", scope.propertyIds,
      "Delete property maintenance schedules");
    plan.deleteIn("vendors", "id", scope.vendorIds, "Delete vendors");
    if (scope.propertyIds.length > 0) {
      plan.deleteWhere("invitations", [{ op: "in", column: "property_id", values: scope.propertyIds }],
        "Delete invitations by property");
    }
    if (scope.accountIds.length > 0) {
      plan.deleteWhere("invitations", [{ op: "in", column: "ownership_account_id", values: scope.accountIds }],
        "Delete invitations by account");
    }
    if (auth.email) {
      plan.deleteWhere("invitations", [{ op: "eq", column: "email", value: auth.email.toLowerCase() }],
        "Delete invitations by email");
    }
    plan.deleteWhere("invitations", [{ op: "eq", column: "invited_by", value: auth.userId }],
      "Delete invitations by inviter");
    plan.deleteWhere("invitations", [{ op: "eq", column: "invited_profile_id", value: auth.userId }],
      "Delete invitations by invitee");
    plan.deleteIn("inspections", "lease_id", scope.leaseIds, "Delete lease inspections");
    plan.deleteIn("documents", "lease_id", scope.leaseIds, "Delete lease documents");
    plan.deleteIn("leases", "id", scope.leaseIds, "Delete leases");
    plan.deleteIn("documents", "unit_id", scope.unitIds, "Delete unit documents");
    plan.deleteIn("communication_logs", "unit_id", scope.unitIds, "Delete unit communication logs");
    plan.deleteIn("units", "id", scope.unitIds, "Delete units");
    plan.deleteIn("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    plan.deleteIn("documents", "property_id", scope.propertyIds, "Delete property documents");
    plan.deleteIn("communication_logs", "property_id", scope.propertyIds, "Delete property communication logs");
    plan.deleteIn("properties", "id", scope.propertyIds, "Delete properties");
    plan.deleteIn("withdrawal_votes", "request_id", requestIds[0], "Delete withdrawal votes");
    plan.deleteIn("withdrawal_requests", "ownership_account_id", scope.accountIds, "Delete withdrawal requests");
    plan.deleteIn("distribution_change_votes", "request_id", requestIds[1], "Delete distribution change votes");
    plan.deleteIn("distribution_change_requests", "ownership_account_id", scope.accountIds, "Delete distribution change requests");
    plan.deleteIn("account_rename_votes", "request_id", requestIds[2], "Delete account rename votes");
    plan.deleteIn("account_rename_requests", "ownership_account_id", scope.accountIds, "Delete account rename requests");
    plan.deleteIn("account_delete_votes", "request_id", requestIds[3], "Delete account delete votes");
    plan.deleteIn("account_delete_requests", "ownership_account_id", scope.accountIds, "Delete account delete requests");
    plan.deleteIn("ownership_account_members", "account_id", scope.accountIds, "Delete ownership account members");
    plan.deleteWhere("ownership_account_members", [{ op: "eq", column: "profile_id", value: auth.userId }],
      "Delete remaining ownership memberships");
    plan.deleteIn("ownership_accounts", "id", scope.accountIds, "Delete ownership accounts");
    plan.deleteIn("notification_deliveries", "notification_id", scope.notificationIds, "Delete notification deliveries");
    plan.deleteIn("notifications", "id", scope.notificationIds, "Delete notifications");
    plan.deleteIn("message_deliveries", "message_id", scope.messageIds, "Delete message deliveries");
    plan.deleteIn("inbox_messages", "id", scope.messageIds, "Delete inbox messages");
    plan.deleteIn("inbox_threads", "id", scope.threadIds, "Delete inbox threads");
    plan.deleteWhere("notification_preferences", [{ op: "eq", column: "profile_id", value: auth.userId }],
      "Delete notification preferences");
    await applyWipePlan(plan, { userId: auth.userId, scope });
    await revalidateSettingsSurfaces();
    return { success: true, message: "Your Domus account data has been wiped." };
  } catch (error) {
    console.error("fullAccountWipe error:", error);
    return { success: false, error: "Unable to complete the full account wipe right now." };
  }
}
