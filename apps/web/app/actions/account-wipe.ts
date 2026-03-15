"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdministeredOwnerAccountIds,
  getAdministeredPropertyIds
} from "@/lib/property-access";
import { checkRateLimit } from "@/lib/rate-limit";
import { isMissingSchemaError } from "@/lib/supabase-errors";
import { requireAuth } from "./auth-helpers";
import type { ActionState } from "./shared";

interface DeletionScope {
  accountIds: string[];
  propertyIds: string[];
  unitIds: string[];
  leaseIds: string[];
  chargeIds: string[];
  paymentIds: string[];
  ticketIds: string[];
  listingIds: string[];
  applicationIds: string[];
  automationRuleIds: string[];
  documentTemplateIds: string[];
  documentPacketIds: string[];
  notificationIds: string[];
  threadIds: string[];
  messageIds: string[];
  propertyFiles: Array<{ id: string; storage_path: string }>;
  maintenancePhotos: Array<{ id: string; storage_path: string }>;
}

interface AuthContext {
  userId: string;
  email: string | null;
}

type WipeAuthResult = AuthContext | { success: false; error: string };

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

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

async function selectRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  label: string
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (isMissingSchemaError(error)) {
      return [];
    }
    throw new Error(`${label}: ${error.message ?? "Unknown error."}`);
  }
  return data ?? [];
}

async function executeMutation(
  query: PromiseLike<{ error: { code?: string; message?: string } | null }>,
  label: string
) {
  const { error } = await query;
  if (error && !isMissingSchemaError(error)) {
    throw new Error(`${label}: ${error.message ?? "Unknown error."}`);
  }
}

async function deleteByIds(
  table: string,
  column: string,
  ids: string[],
  label: string
) {
  if (ids.length === 0) {
    return;
  }
  const admin = createAdminClient();
  await executeMutation(admin.from(table).delete().in(column, ids), label);
}

async function updateByIds(
  table: string,
  values: Record<string, unknown>,
  column: string,
  ids: string[],
  label: string
) {
  if (ids.length === 0) {
    return;
  }
  const admin = createAdminClient();
  await executeMutation(admin.from(table).update(values).in(column, ids), label);
}

async function removeStorageObjects(bucket: string, paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.error(`Failed to remove ${bucket} storage objects:`, error);
  }
}

async function loadDeletionScope(userId: string): Promise<DeletionScope> {
  const admin = createAdminClient();
  const [accountIds, propertyIds] = await Promise.all([
    getAdministeredOwnerAccountIds(userId),
    getAdministeredPropertyIds(userId)
  ]);

  const unitRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("units").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load units"
  );
  const unitIds = unitRows.map((unit) => unit.id);

  const leaseRows = await selectRows<{ id: string }>(
    unitIds.length
      ? admin.from("leases").select("id").in("unit_id", unitIds)
      : Promise.resolve({ data: [], error: null }),
    "load leases"
  );
  const leaseIds = leaseRows.map((lease) => lease.id);

  const chargeRows = await selectRows<{ id: string }>(
    leaseIds.length
      ? admin.from("rent_charges").select("id").in("lease_id", leaseIds)
      : Promise.resolve({ data: [], error: null }),
    "load rent charges"
  );
  const chargeIds = chargeRows.map((charge) => charge.id);

  const paymentRows = await selectRows<{ id: string }>(
    chargeIds.length
      ? admin.from("payments").select("id").in("rent_charge_id", chargeIds)
      : Promise.resolve({ data: [], error: null }),
    "load payments"
  );
  const paymentIds = paymentRows.map((payment) => payment.id);

  const ticketRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("maintenance_tickets").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load maintenance tickets"
  );
  const ticketIds = ticketRows.map((ticket) => ticket.id);

  const listingRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("rental_listings").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load rental listings"
  );
  const listingIds = listingRows.map((listing) => listing.id);

  const applicationRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("rental_applications").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load rental applications"
  );
  const applicationIds = applicationRows.map((application) => application.id);

  const automationRuleRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("automation_rules").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load automation rules"
  );
  const automationRuleIds = automationRuleRows.map((rule) => rule.id);

  const templateRows = await selectRows<{ id: string }>(
    accountIds.length
      ? admin.from("document_templates").select("id").in("owner_account_id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    "load document templates"
  );
  const documentTemplateIds = templateRows.map((template) => template.id);

  const packetRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("document_packets").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load document packets"
  );
  const documentPacketIds = packetRows.map((packet) => packet.id);

  const notificationRows = await selectRows<{ id: string }>(
    admin.from("notifications").select("id").eq("recipient_profile_id", userId),
    "load notifications"
  );
  const notificationIds = notificationRows.map((notification) => notification.id);

  const [propertyThreads, ownedThreads] = await Promise.all([
    selectRows<{ id: string }>(
      propertyIds.length
        ? admin.from("inbox_threads").select("id").in("property_id", propertyIds)
        : Promise.resolve({ data: [], error: null }),
      "load property inbox threads"
    ),
    selectRows<{ id: string }>(
      admin.from("inbox_threads").select("id").eq("created_by_profile_id", userId),
      "load owned inbox threads"
    )
  ]);
  const threadIds = unique([
    ...propertyThreads.map((thread) => thread.id),
    ...ownedThreads.map((thread) => thread.id)
  ]);

  const messageRows = await selectRows<{ id: string }>(
    threadIds.length
      ? admin.from("inbox_messages").select("id").in("thread_id", threadIds)
      : Promise.resolve({ data: [], error: null }),
    "load inbox messages"
  );
  const messageIds = messageRows.map((message) => message.id);

  const propertyFiles = await selectRows<{ id: string; storage_path: string }>(
    propertyIds.length
      ? admin.from("property_files").select("id, storage_path").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load property files"
  );

  const maintenancePhotos = await selectRows<{ id: string; storage_path: string }>(
    ticketIds.length
      ? admin.from("maintenance_photos").select("id, storage_path").in("ticket_id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    "load maintenance photos"
  );

  return {
    accountIds,
    propertyIds,
    unitIds,
    leaseIds,
    chargeIds,
    paymentIds,
    ticketIds,
    listingIds,
    applicationIds,
    automationRuleIds,
    documentTemplateIds,
    documentPacketIds,
    notificationIds,
    threadIds,
    messageIds,
    propertyFiles,
    maintenancePhotos
  };
}

async function deleteDistributionRecords(scope: DeletionScope) {
  await deleteByIds("payment_distributions", "payment_id", scope.paymentIds, "Delete payment distributions by payment");
  await deleteByIds("payment_distributions", "account_id", scope.accountIds, "Delete payment distributions by account");
}

async function deleteLeaseFinancials(scope: DeletionScope) {
  await deleteDistributionRecords(scope);
  await deleteByIds("payments", "id", scope.paymentIds, "Delete payments");
  await deleteByIds("rent_charges", "id", scope.chargeIds, "Delete rent charges");
  await deleteByIds("autopay_enrollments", "lease_id", scope.leaseIds, "Delete autopay enrollments");
}

async function deleteLeasingPipeline(scope: DeletionScope) {
  await deleteByIds("screening_reports", "application_id", scope.applicationIds, "Delete screening reports");
  await deleteByIds("application_events", "application_id", scope.applicationIds, "Delete application events");
  await deleteByIds("rental_applications", "id", scope.applicationIds, "Delete rental applications");
  await deleteByIds("rental_listings", "id", scope.listingIds, "Delete rental listings");
}

async function deleteDocuments(scope: DeletionScope, includeTemplates = false) {
  await deleteByIds("document_signers", "packet_id", scope.documentPacketIds, "Delete document signers");
  await deleteByIds("document_packets", "id", scope.documentPacketIds, "Delete document packets");
  await removeStorageObjects(
    "property-files",
    scope.propertyFiles.map((file) => file.storage_path)
  );
  await deleteByIds("property_files", "id", scope.propertyFiles.map((file) => file.id), "Delete property files");
  if (includeTemplates) {
    await deleteByIds("document_templates", "id", scope.documentTemplateIds, "Delete document templates");
  }
}

async function deleteMaintenance(scope: DeletionScope) {
  await deleteByIds("maintenance_assignments", "ticket_id", scope.ticketIds, "Delete maintenance assignments");
  await removeStorageObjects(
    "maintenance-photos",
    scope.maintenancePhotos.map((photo) => photo.storage_path)
  );
  await deleteByIds(
    "maintenance_photos",
    "id",
    scope.maintenancePhotos.map((photo) => photo.id),
    "Delete maintenance photos"
  );
  await deleteByIds("maintenance_tickets", "id", scope.ticketIds, "Delete maintenance tickets");
}

async function deleteAutomation(scope: DeletionScope) {
  await deleteByIds("automation_runs", "rule_id", scope.automationRuleIds, "Delete automation runs");
  await deleteByIds("automation_rules", "id", scope.automationRuleIds, "Delete automation rules");
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
    await deleteByIds("property_expenses", "property_id", scope.propertyIds, "Delete expenses");
    await deleteByIds("vendors", "property_id", scope.propertyIds, "Delete vendors");
    await deleteByIds("property_managers", "property_id", scope.propertyIds, "Delete property managers");
    await deleteByIds("invitations", "property_id", scope.propertyIds, "Delete invitations");
    await deleteByIds("leases", "id", scope.leaseIds, "Delete leases");
    await deleteByIds("units", "id", scope.unitIds, "Delete units");
    await updateByIds("properties", { active: false }, "id", scope.propertyIds, "Deactivate properties");
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
    await executeMutation(admin.from("user_achievements").delete().eq("user_id", auth.userId), "Delete achievements");
    await executeMutation(admin.from("xp_events").delete().eq("user_id", auth.userId), "Delete XP events");
    await executeMutation(admin.from("user_gamification").delete().eq("user_id", auth.userId), "Delete gamification state");
    await revalidateSettingsSurfaces();
    return { success: true, message: "Your Domus account data has been wiped." };
  } catch (error) {
    console.error("fullAccountWipe error:", error);
    return { success: false, error: "Unable to complete the full account wipe right now." };
  }
}
