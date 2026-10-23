"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";
import { unique, selectRows, loadDeletionScope } from "@/lib/account-wipe/scope";
import {
  executeMutation, deleteByIds, updateByIds, deleteDistributionRecords,
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
    await deleteLeaseFinancials(scope);
    await deleteMaintenance(scope);
    await deleteDocuments(scope, false);
    await deleteLeasingPipeline(scope);
    await deleteAutomation(scope);
    await deleteByIds("manager_payments", "property_id", scope.propertyIds, "Delete manager payments");
    await deleteByIds("manager_payment_configs", "property_id", scope.propertyIds, "Delete manager payment configs");
    await deleteByIds("property_expenses", "id", scope.expenseIds, "Delete expenses");
    await deleteByIds("vendors", "property_id", scope.propertyIds, "Delete vendors");
    await deleteByIds("notification_deliveries", "notification_id", scope.propertyNotificationIds, "Delete property notification deliveries");
    await deleteByIds("notifications", "id", scope.propertyNotificationIds, "Delete property notifications");
    await deleteByIds("message_deliveries", "message_id", scope.propertyMessageIds, "Delete property message deliveries");
    await deleteByIds("inbox_messages", "id", scope.propertyMessageIds, "Delete property inbox messages");
    await deleteByIds("inbox_threads", "id", scope.propertyThreadIds, "Delete property inbox threads");
    await deleteByIds("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    await deleteByIds("invitations", "id", scope.invitationIds, "Delete invitations");
    await deleteByIds("leases", "id", scope.leaseIds, "Delete leases");
    await deleteByIds("units", "id", scope.unitIds, "Delete units");
    await deleteByIds("properties", "id", scope.propertyIds, "Delete properties");
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

    await deleteByIds("payment_distributions", "payment_id", paymentRows.map((payment) => payment.id), "Delete tenant payment distributions");
    await deleteByIds("payments", "id", paymentRows.map((payment) => payment.id), "Delete tenant payments");
    await deleteByIds("rent_charges", "id", chargeIds, "Delete tenant rent charges");
    await deleteByIds("autopay_enrollments", "lease_id", tenantLeaseIds, "Delete tenant autopay enrollments");
    await deleteByIds("document_signers", "packet_id", packetRows.map((packet) => packet.id), "Delete tenant document signers");
    await deleteByIds("document_packets", "id", packetRows.map((packet) => packet.id), "Delete tenant document packets");
    await executeMutation(
      admin
        .from("maintenance_tickets")
        .delete()
        .in("property_id", scope.propertyIds)
        .not("tenant_profile_id", "is", null),
      "Delete tenant maintenance tickets"
    );
    await executeMutation(
      admin
        .from("invitations")
        .delete()
        .eq("role", "tenant")
        .in("property_id", scope.propertyIds),
      "Delete tenant invitations"
    );
    await deleteByIds("leases", "id", tenantLeaseIds, "Delete tenant leases");
    await updateByIds("units", { occupied: false }, "id", tenantUnitIds, "Reset unit occupancy");
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
    const admin = createAdminClient();
    const scope = await loadDeletionScope(auth.userId);
    await deleteByIds("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    await executeMutation(
      admin
        .from("invitations")
        .delete()
        .eq("role", "manager")
        .in("property_id", scope.propertyIds),
      "Delete manager invitations"
    );
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
    await deleteLeaseFinancials(scope);
    await deleteByIds("document_signers", "packet_id", packetRows.map((packet) => packet.id), "Delete lease document signers");
    await deleteByIds("document_packets", "id", packetRows.map((packet) => packet.id), "Delete lease document packets");
    await deleteByIds("leases", "id", scope.leaseIds, "Delete leases");
    await updateByIds("units", { occupied: false }, "id", scope.unitIds, "Reset occupied units");
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
    await deleteDistributionRecords(scope);
    await deleteByIds("payments", "id", scope.paymentIds, "Delete payments");
    await deleteByIds("rent_charges", "id", scope.chargeIds, "Delete rent charges");
    await deleteByIds("property_expenses", "property_id", scope.propertyIds, "Delete expenses");
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

    await deleteLeaseFinancials(scope);
    await deleteMaintenance(scope);
    await deleteByIds("property_expenses", "property_id", scope.propertyIds, "Delete expenses");
    await deleteDocuments(scope, true);
    await deleteLeasingPipeline(scope);
    await deleteAutomation(scope);
    await deleteByIds("vendors", "property_id", scope.propertyIds, "Delete vendors");
    if (scope.propertyIds.length > 0) {
      await executeMutation(
        admin.from("invitations").delete().in("property_id", scope.propertyIds),
        "Delete invitations by property"
      );
    }
    if (scope.accountIds.length > 0) {
      await executeMutation(
        admin.from("invitations").delete().in("ownership_account_id", scope.accountIds),
        "Delete invitations by account"
      );
    }
    if (auth.email) {
      await executeMutation(
        admin.from("invitations").delete().eq("email", auth.email.toLowerCase()),
        "Delete invitations by email"
      );
    }
    await executeMutation(
      admin.from("invitations").delete().eq("invited_by", auth.userId),
      "Delete invitations by inviter"
    );
    await executeMutation(
      admin.from("invitations").delete().eq("invited_profile_id", auth.userId),
      "Delete invitations by invitee"
    );
    await deleteByIds("leases", "id", scope.leaseIds, "Delete leases");
    await deleteByIds("units", "id", scope.unitIds, "Delete units");
    await deleteByIds("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    await deleteByIds("properties", "id", scope.propertyIds, "Delete properties");
    await deleteByIds("withdrawal_votes", "request_id", await selectRows<{ id: string }>(
      scope.accountIds.length
        ? admin.from("withdrawal_requests").select("id").in("ownership_account_id", scope.accountIds)
        : Promise.resolve({ data: [], error: null }),
      "Load withdrawal requests"
    ).then((rows) => rows.map((row) => row.id)), "Delete withdrawal votes");
    await deleteByIds("withdrawal_requests", "ownership_account_id", scope.accountIds, "Delete withdrawal requests");
    await deleteByIds("distribution_change_votes", "request_id", await selectRows<{ id: string }>(
      scope.accountIds.length
        ? admin.from("distribution_change_requests").select("id").in("ownership_account_id", scope.accountIds)
        : Promise.resolve({ data: [], error: null }),
      "Load distribution change requests"
    ).then((rows) => rows.map((row) => row.id)), "Delete distribution change votes");
    await deleteByIds("distribution_change_requests", "ownership_account_id", scope.accountIds, "Delete distribution change requests");
    await deleteByIds("account_rename_votes", "request_id", await selectRows<{ id: string }>(
      scope.accountIds.length
        ? admin.from("account_rename_requests").select("id").in("ownership_account_id", scope.accountIds)
        : Promise.resolve({ data: [], error: null }),
      "Load account rename requests"
    ).then((rows) => rows.map((row) => row.id)), "Delete account rename votes");
    await deleteByIds("account_rename_requests", "ownership_account_id", scope.accountIds, "Delete account rename requests");
    await deleteByIds("account_delete_votes", "request_id", await selectRows<{ id: string }>(
      scope.accountIds.length
        ? admin.from("account_delete_requests").select("id").in("ownership_account_id", scope.accountIds)
        : Promise.resolve({ data: [], error: null }),
      "Load account delete requests"
    ).then((rows) => rows.map((row) => row.id)), "Delete account delete votes");
    await deleteByIds("account_delete_requests", "ownership_account_id", scope.accountIds, "Delete account delete requests");
    await deleteByIds("ownership_account_members", "account_id", scope.accountIds, "Delete ownership account members");
    await executeMutation(
      admin.from("ownership_account_members").delete().eq("profile_id", auth.userId),
      "Delete remaining ownership memberships"
    );
    await deleteByIds("ownership_accounts", "id", scope.accountIds, "Delete ownership accounts");
    await deleteByIds("notification_deliveries", "notification_id", scope.notificationIds, "Delete notification deliveries");
    await deleteByIds("notifications", "id", scope.notificationIds, "Delete notifications");
    await deleteByIds("message_deliveries", "message_id", scope.messageIds, "Delete message deliveries");
    await deleteByIds("inbox_messages", "id", scope.messageIds, "Delete inbox messages");
    await deleteByIds("inbox_threads", "id", scope.threadIds, "Delete inbox threads");
    await executeMutation(admin.from("notification_preferences").delete().eq("profile_id", auth.userId), "Delete notification preferences");
    await revalidateSettingsSurfaces();
    return { success: true, message: "Your Domus account data has been wiped." };
  } catch (error) {
    console.error("fullAccountWipe error:", error);
    return { success: false, error: "Unable to complete the full account wipe right now." };
  }
}
