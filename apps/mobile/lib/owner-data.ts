import { getSupabaseClient } from "./supabase";
import { isMissingSchemaError } from "./tenant-data";
import type {
  MobileDocumentDTO,
  MobileNotificationDTO,
  MobileOwnerTicketDTO,
  MobilePropertySummaryDTO,
} from "./types";

async function queryPropertyIdsByOwnerProfile(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient();

  const ownedQuery = await supabase
    .from("properties")
    .select("id, active")
    .eq("owner_profile_id", userId);

  if (ownedQuery.error) {
    if (isMissingSchemaError(ownedQuery.error)) {
      const fallbackQuery = await supabase
        .from("properties")
        .select("id")
        .eq("owner_profile_id", userId);

      if (fallbackQuery.error && !isMissingSchemaError(fallbackQuery.error)) {
        throw fallbackQuery.error;
      }

      return (fallbackQuery.data ?? []).map((property) => property.id);
    }

    throw ownedQuery.error;
  }

  return (ownedQuery.data ?? [])
    .filter((property) => property.active !== false)
    .map((property) => property.id);
}

async function queryPropertyIdsByOwnerAccount(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient();

  const membershipQuery = await supabase
    .from("ownership_account_members")
    .select("account_id")
    .eq("profile_id", userId)
    .eq("member_role", "owner")
    .eq("active", true);

  if (membershipQuery.error) {
    if (isMissingSchemaError(membershipQuery.error)) {
      return [];
    }

    throw membershipQuery.error;
  }

  const accountIds = (membershipQuery.data ?? []).map((membership) => membership.account_id);
  if (accountIds.length === 0) {
    return [];
  }

  const accountPropertyQuery = await supabase
    .from("properties")
    .select("id, active")
    .in("owner_account_id", accountIds);

  if (accountPropertyQuery.error) {
    if (isMissingSchemaError(accountPropertyQuery.error)) {
      return [];
    }

    throw accountPropertyQuery.error;
  }

  return (accountPropertyQuery.data ?? [])
    .filter((property) => property.active !== false)
    .map((property) => property.id);
}

async function queryPropertyIdsByManagerAssignment(userId: string): Promise<string[]> {
  const supabase = getSupabaseClient();

  const assignmentQuery = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  if (assignmentQuery.error) {
    if (isMissingSchemaError(assignmentQuery.error)) {
      return [];
    }

    throw assignmentQuery.error;
  }

  return (assignmentQuery.data ?? []).map((assignment) => assignment.property_id);
}

export async function getAdministeredPropertyIds(userId: string): Promise<string[]> {
  const [legacyOwnerIds, accountOwnerIds, managerIds] = await Promise.all([
    queryPropertyIdsByOwnerProfile(userId),
    queryPropertyIdsByOwnerAccount(userId),
    queryPropertyIdsByManagerAssignment(userId),
  ]);

  return Array.from(new Set([...legacyOwnerIds, ...accountOwnerIds, ...managerIds]));
}

export async function fetchOwnerPortfolio(userId: string): Promise<MobilePropertySummaryDTO[]> {
  const supabase = getSupabaseClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return [];
  }

  const propertyQuery = await supabase
    .from("properties")
    .select("id, name, address_line1, city, state, postal_code, active")
    .in("id", propertyIds)
    .order("created_at", { ascending: true });

  if (propertyQuery.error) {
    if (isMissingSchemaError(propertyQuery.error)) {
      const fallbackQuery = await supabase
        .from("properties")
        .select("id, name, address_line1, city, state, postal_code")
        .in("id", propertyIds)
        .order("created_at", { ascending: true });

      if (fallbackQuery.error && !isMissingSchemaError(fallbackQuery.error)) {
        throw fallbackQuery.error;
      }

      const unitsQuery = await supabase
        .from("units")
        .select("id, property_id, occupied")
        .in("property_id", propertyIds);

      if (unitsQuery.error && !isMissingSchemaError(unitsQuery.error)) {
        throw unitsQuery.error;
      }

      const units = unitsQuery.data ?? [];
      const unitCountByProperty = new Map<string, number>();
      const occupiedByProperty = new Map<string, number>();

      for (const unit of units) {
        unitCountByProperty.set(unit.property_id, (unitCountByProperty.get(unit.property_id) ?? 0) + 1);
        if (unit.occupied) {
          occupiedByProperty.set(unit.property_id, (occupiedByProperty.get(unit.property_id) ?? 0) + 1);
        }
      }

      return (fallbackQuery.data ?? []).map((property) => ({
        id: property.id,
        name: property.name,
        addressLine1: property.address_line1,
        city: property.city,
        state: property.state,
        postalCode: property.postal_code,
        unitCount: unitCountByProperty.get(property.id) ?? 0,
        occupiedUnitCount: occupiedByProperty.get(property.id) ?? 0,
      }));
    }

    throw propertyQuery.error;
  }

  const activeProperties = (propertyQuery.data ?? []).filter((property) => property.active !== false);

  const unitsQuery = await supabase
    .from("units")
    .select("id, property_id, occupied, active")
    .in("property_id", activeProperties.map((property) => property.id));

  if (unitsQuery.error) {
    if (!isMissingSchemaError(unitsQuery.error)) {
      throw unitsQuery.error;
    }
  }

  const units = (unitsQuery.data ?? []).filter((unit) => unit.active !== false);
  const unitCountByProperty = new Map<string, number>();
  const occupiedByProperty = new Map<string, number>();

  for (const unit of units) {
    unitCountByProperty.set(unit.property_id, (unitCountByProperty.get(unit.property_id) ?? 0) + 1);
    if (unit.occupied) {
      occupiedByProperty.set(unit.property_id, (occupiedByProperty.get(unit.property_id) ?? 0) + 1);
    }
  }

  return activeProperties.map((property) => ({
    id: property.id,
    name: property.name,
    addressLine1: property.address_line1,
    city: property.city,
    state: property.state,
    postalCode: property.postal_code,
    unitCount: unitCountByProperty.get(property.id) ?? 0,
    occupiedUnitCount: occupiedByProperty.get(property.id) ?? 0,
  }));
}

export async function fetchOwnerTickets(userId: string): Promise<MobileOwnerTicketDTO[]> {
  const supabase = getSupabaseClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return [];
  }

  const ticketQuery = await supabase
    .from("maintenance_tickets")
    .select("id, property_id, unit_id, title, description, status, priority, created_at")
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (ticketQuery.error) {
    if (isMissingSchemaError(ticketQuery.error)) {
      return [];
    }

    throw ticketQuery.error;
  }

  const tickets = ticketQuery.data ?? [];
  if (tickets.length === 0) {
    return [];
  }

  const unitIds = Array.from(new Set(tickets.map((ticket) => ticket.unit_id).filter((id): id is string => Boolean(id))));

  const [propertyResult, unitsResult, assignmentsResult] = await Promise.all([
    supabase.from("properties").select("id, name").in("id", propertyIds),
    unitIds.length
      ? supabase.from("units").select("id, unit_number").in("id", unitIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("maintenance_assignments")
      .select("ticket_id, vendor_id, assigned_at")
      .in("ticket_id", tickets.map((ticket) => ticket.id))
      .order("assigned_at", { ascending: false }),
  ]);

  if (propertyResult.error && !isMissingSchemaError(propertyResult.error)) {
    throw propertyResult.error;
  }

  if (unitsResult.error && !isMissingSchemaError(unitsResult.error)) {
    throw unitsResult.error;
  }

  if (assignmentsResult.error && !isMissingSchemaError(assignmentsResult.error)) {
    throw assignmentsResult.error;
  }

  const latestAssignmentByTicketId = new Map<string, string>();
  for (const assignment of assignmentsResult.data ?? []) {
    if (!latestAssignmentByTicketId.has(assignment.ticket_id)) {
      latestAssignmentByTicketId.set(assignment.ticket_id, assignment.vendor_id);
    }
  }

  const vendorIds = Array.from(new Set(Array.from(latestAssignmentByTicketId.values())));
  const vendorsResult = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [], error: null };

  if (vendorsResult.error && !isMissingSchemaError(vendorsResult.error)) {
    throw vendorsResult.error;
  }

  const propertyById = new Map((propertyResult.data ?? []).map((property) => [property.id, property.name]));
  const unitById = new Map((unitsResult.data ?? []).map((unit) => [unit.id, unit.unit_number]));
  const vendorById = new Map((vendorsResult.data ?? []).map((vendor) => [vendor.id, vendor.name]));

  return tickets.map((ticket) => {
    const vendorId = latestAssignmentByTicketId.get(ticket.id);
    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.created_at,
      propertyName: propertyById.get(ticket.property_id) ?? "Property",
      unitNumber: ticket.unit_id ? unitById.get(ticket.unit_id) ?? null : null,
      vendorName: vendorId ? vendorById.get(vendorId) ?? null : null,
    };
  });
}

export async function fetchOwnerNotifications(userId: string): Promise<MobileNotificationDTO[]> {
  const supabase = getSupabaseClient();

  const result = await supabase
    .from("notifications")
    .select("id, type, title, body, read_at, created_at")
    .eq("recipient_profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    if (isMissingSchemaError(result.error)) {
      return [];
    }
    throw result.error;
  }

  return (result.data ?? []).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    readAt: notification.read_at,
    createdAt: notification.created_at,
  }));
}

export async function fetchOwnerPendingChargeCount(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return 0;
  }

  const unitsResult = await supabase
    .from("units")
    .select("id")
    .in("property_id", propertyIds);

  if (unitsResult.error) {
    if (isMissingSchemaError(unitsResult.error)) {
      return 0;
    }
    throw unitsResult.error;
  }

  const unitIds = (unitsResult.data ?? []).map((unit) => unit.id);
  if (unitIds.length === 0) {
    return 0;
  }

  const leasesResult = await supabase
    .from("leases")
    .select("id")
    .in("unit_id", unitIds)
    .eq("active", true);

  if (leasesResult.error) {
    if (isMissingSchemaError(leasesResult.error)) {
      return 0;
    }
    throw leasesResult.error;
  }

  const leaseIds = (leasesResult.data ?? []).map((lease) => lease.id);
  if (leaseIds.length === 0) {
    return 0;
  }

  const chargesResult = await supabase
    .from("rent_charges")
    .select("id")
    .in("lease_id", leaseIds)
    .in("status", ["pending", "late"]);

  if (chargesResult.error) {
    if (isMissingSchemaError(chargesResult.error)) {
      return 0;
    }
    throw chargesResult.error;
  }

  return (chargesResult.data ?? []).length;
}

export async function fetchOwnerDocuments(userId: string): Promise<MobileDocumentDTO[]> {
  const supabase = getSupabaseClient();
  const propertyIds = await getAdministeredPropertyIds(userId);

  if (propertyIds.length === 0) {
    return [];
  }

  const packetResult = await supabase
    .from("document_packets")
    .select("id, template_id, property_id, status, created_at, signed_at")
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (packetResult.error) {
    if (isMissingSchemaError(packetResult.error)) {
      return [];
    }
    throw packetResult.error;
  }

  const packetRows = packetResult.data ?? [];
  if (packetRows.length === 0) {
    return [];
  }

  const templateIds = Array.from(new Set(packetRows.map((packet) => packet.template_id)));
  const [templateResult, propertyResult] = await Promise.all([
    templateIds.length
      ? supabase.from("document_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("properties").select("id, name").in("id", propertyIds),
  ]);

  if (templateResult.error && !isMissingSchemaError(templateResult.error)) {
    throw templateResult.error;
  }
  if (propertyResult.error && !isMissingSchemaError(propertyResult.error)) {
    throw propertyResult.error;
  }

  const templateById = new Map((templateResult.data ?? []).map((template) => [template.id, template.name]));
  const propertyById = new Map((propertyResult.data ?? []).map((property) => [property.id, property.name]));

  return packetRows.map((packet) => ({
    id: packet.id,
    templateName: templateById.get(packet.template_id) ?? "Document Packet",
    propertyLabel: propertyById.get(packet.property_id) ?? "Property",
    packetStatus: packet.status,
    signerStatus: packet.status === "signed" ? "signed" : "pending",
    createdAt: packet.created_at,
    signedAt: packet.signed_at,
  }));
}
