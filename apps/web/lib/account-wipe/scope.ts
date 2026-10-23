import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdministeredOwnerAccountIds,
  getAdministeredPropertyIds
} from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

export interface DeletionScope {
  accountIds: string[];
  propertyIds: string[];
  unitIds: string[];
  leaseIds: string[];
  chargeIds: string[];
  paymentIds: string[];
  ticketIds: string[];
  expenseIds: string[];
  invitationIds: string[];
  managerPaymentIds: string[];
  listingIds: string[];
  applicationIds: string[];
  automationRuleIds: string[];
  documentTemplateIds: string[];
  documentPacketIds: string[];
  propertyNotificationIds: string[];
  notificationIds: string[];
  propertyThreadIds: string[];
  threadIds: string[];
  propertyMessageIds: string[];
  messageIds: string[];
  propertyFiles: Array<{ id: string; storage_path: string }>;
  maintenancePhotos: Array<{ id: string; storage_path: string }>;
}

export function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function selectRows<T>(
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

export async function loadNotificationIdsForEntity(
  admin: ReturnType<typeof createAdminClient>,
  entityType: string,
  entityIds: string[],
  label: string
) {
  const rows = await selectRows<{ id: string }>(
    entityIds.length
      ? admin
          .from("notifications")
          .select("id")
          .eq("entity_type", entityType)
          .in("entity_id", entityIds)
      : Promise.resolve({ data: [], error: null }),
    label
  );

  return rows.map((row) => row.id);
}

export async function loadDeletionScope(userId: string): Promise<DeletionScope> {
  const admin = createAdminClient();
  const [accountIdsSettled, propertyIdsSettled] = await Promise.allSettled([
    getAdministeredOwnerAccountIds(userId),
    getAdministeredPropertyIds(userId)
  ]);

  if (
    accountIdsSettled.status === "rejected" ||
    propertyIdsSettled.status === "rejected"
  ) {
    if (accountIdsSettled.status === "rejected") {
      console.error("loadDeletionScope accountIds error:", accountIdsSettled.reason);
    }
    if (propertyIdsSettled.status === "rejected") {
      console.error("loadDeletionScope propertyIds error:", propertyIdsSettled.reason);
    }
    throw new Error("Unable to load the account wipe scope.");
  }

  const accountIds = accountIdsSettled.value;
  const propertyIds = propertyIdsSettled.value;

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

  const expenseRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("property_expenses").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load property expenses"
  );
  const expenseIds = expenseRows.map((expense) => expense.id);

  const invitationRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("invitations").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load invitations"
  );
  const invitationIds = invitationRows.map((invitation) => invitation.id);

  const managerPaymentRows = await selectRows<{ id: string }>(
    propertyIds.length
      ? admin.from("manager_payments").select("id").in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    "load manager payments"
  );
  const managerPaymentIds = managerPaymentRows.map((payment) => payment.id);

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

  const [
    propertyNotificationIds,
    ownerNotificationIds
  ] = await Promise.all([
    Promise.all([
      loadNotificationIdsForEntity(admin, "property", propertyIds, "load property notifications"),
      loadNotificationIdsForEntity(admin, "unit", unitIds, "load unit notifications"),
      loadNotificationIdsForEntity(admin, "lease", leaseIds, "load lease notifications"),
      loadNotificationIdsForEntity(admin, "rent_charge", chargeIds, "load rent charge notifications"),
      loadNotificationIdsForEntity(admin, "charge", chargeIds, "load charge notifications"),
      loadNotificationIdsForEntity(admin, "maintenance_ticket", ticketIds, "load maintenance ticket notifications"),
      loadNotificationIdsForEntity(admin, "ticket", ticketIds, "load ticket notifications"),
      loadNotificationIdsForEntity(admin, "expense", expenseIds, "load expense notifications"),
      loadNotificationIdsForEntity(admin, "invitation", invitationIds, "load invitation notifications"),
      loadNotificationIdsForEntity(admin, "manager_payment", managerPaymentIds, "load manager payment notifications")
    ]).then((groups) => unique(groups.flat())),
    selectRows<{ id: string }>(
      admin.from("notifications").select("id").eq("recipient_profile_id", userId),
      "load notifications"
    ).then((rows) => rows.map((row) => row.id))
  ]);
  const notificationIds = unique([...ownerNotificationIds, ...propertyNotificationIds]);

  const [propertyThreadsSettled, ownedThreadsSettled] = await Promise.allSettled([
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
  if (
    propertyThreadsSettled.status === "rejected" ||
    ownedThreadsSettled.status === "rejected"
  ) {
    if (propertyThreadsSettled.status === "rejected") {
      console.error("loadDeletionScope propertyThreads error:", propertyThreadsSettled.reason);
    }
    if (ownedThreadsSettled.status === "rejected") {
      console.error("loadDeletionScope ownedThreads error:", ownedThreadsSettled.reason);
    }
    throw new Error("Unable to load the inbox cleanup scope.");
  }
  const propertyThreads = propertyThreadsSettled.value;
  const ownedThreads = ownedThreadsSettled.value;
  const propertyThreadIds = propertyThreads.map((thread) => thread.id);
  const threadIds = unique([
    ...propertyThreadIds,
    ...ownedThreads.map((thread) => thread.id)
  ]);

  const propertyMessageRows = await selectRows<{ id: string }>(
    propertyThreadIds.length
      ? admin.from("inbox_messages").select("id").in("thread_id", propertyThreadIds)
      : Promise.resolve({ data: [], error: null }),
    "load property inbox messages"
  );
  const propertyMessageIds = propertyMessageRows.map((message) => message.id);

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
    expenseIds,
    invitationIds,
    managerPaymentIds,
    listingIds,
    applicationIds,
    automationRuleIds,
    documentTemplateIds,
    documentPacketIds,
    propertyNotificationIds,
    notificationIds,
    propertyThreadIds,
    threadIds,
    propertyMessageIds,
    messageIds,
    propertyFiles,
    maintenancePhotos
  };
}
