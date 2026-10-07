import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAdministeredPropertyIds, getAdministeredPropertyIdsForAccount } from "@/lib/property-access";
import { buildCommentMaps, buildTimelineMaps, buildTicketEnhancementMaps } from "./enrichment";
import type { MaintenanceTicket, TenantUnit, TenantMaintenanceData } from "./enrichment";

export async function getTenantMaintenanceData(userId: string): Promise<TenantMaintenanceData> {
  const supabase = createClient();

  // Get tenant's active leases → units → properties
  const { data: leases } = await supabase
    .from("leases")
    .select("id, unit_id")
    .eq("tenant_profile_id", userId)
    .eq("active", true);

  const leaseRows = leases ?? [];
  const unitIds = leaseRows.map((lease) => lease.unit_id);

  if (unitIds.length === 0) {
    return { tickets: [], units: [] };
  }

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, property_id")
    .in("id", unitIds);

  const propertyIds = Array.from(new Set((units ?? []).map((unit) => unit.property_id)));

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);

  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  // Build the units list for the ticket form dropdown
  const tenantUnits: TenantUnit[] = (units ?? []).map((unit) => ({
    id: unit.id,
    unitNumber: unit.unit_number,
    propertyName: propertyById.get(unit.property_id)?.name ?? "Unknown Property",
  }));

  // Fetch tenant's maintenance tickets
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select(
      "id, property_id, unit_id, title, description, status, priority, actual_cost_cents, created_at, resolved_at",
    )
    .eq("tenant_profile_id", userId)
    .order("created_at", { ascending: false });

  const ticketRows = tickets ?? [];
  const {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId,
  } = await buildTicketEnhancementMaps(
    supabase,
    ticketRows.map((ticket) => ticket.id),
  );
  const { commentCountByTicketId, commentsByTicketId } = await buildCommentMaps(
    supabase,
    ticketRows.map((ticket) => ticket.id),
  );
  const { timelineByTicketId } = await buildTimelineMaps(
    supabase,
    ticketRows.map((ticket) => ticket.id),
  );

  return {
    units: tenantUnits,
    tickets: ticketRows.map((ticket) => {
      const property = propertyById.get(ticket.property_id);
      const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
      const assignment = assignmentByTicketId.get(ticket.id);

      return {
        id: ticket.id,
        propertyId: ticket.property_id,
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unit_number ?? null,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status as MaintenanceTicket["status"],
        priority: ticket.priority as MaintenanceTicket["priority"],
        actualCostCents: ticket.actual_cost_cents,
        vendorName: assignment ? (vendorNameById.get(assignment.vendorId) ?? null) : null,
        assignmentStatus: assignment?.status ?? null,
        photoCount: photoCountByTicketId.get(ticket.id) ?? 0,
        latestPhotoId: latestPhotoIdByTicketId.get(ticket.id) ?? null,
        photos: photosByTicketId.get(ticket.id) ?? [],
        createdAt: ticket.created_at,
        resolvedAt: ticket.resolved_at,
        tenantEmail: null,
        commentCount: commentCountByTicketId.get(ticket.id) ?? 0,
        comments: commentsByTicketId.get(ticket.id) ?? [],
        timeline: timelineByTicketId.get(ticket.id) ?? [],
        isFeatureReady: true,
        featureWarning: null,
      };
    }),
  };
}

export async function getAdminMaintenanceTickets(
  userId: string,
  accountId?: string | null,
  resolvedPropertyIds?: string[],
): Promise<MaintenanceTicket[]> {
  const supabase = createAdminClient();
  const propertyIds =
    resolvedPropertyIds ??
    (accountId
      ? await getAdministeredPropertyIdsForAccount(userId, accountId)
      : await getAdministeredPropertyIds(userId));

  if (propertyIds.length === 0) {
    return [];
  }

  const [propertiesResult, unitsResult, ticketsResult] = await Promise.all([
    supabase.from("properties").select("id, name").in("id", propertyIds),
    supabase.from("units").select("id, unit_number").in("property_id", propertyIds),
    supabase
      .from("maintenance_tickets")
      .select(
        "id, property_id, unit_id, tenant_profile_id, title, description, status, priority, actual_cost_cents, created_at, resolved_at",
      )
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false }),
  ]);
  const properties = propertiesResult.data;
  const units = unitsResult.data;
  const tickets = ticketsResult.data;
  for (const result of [propertiesResult, unitsResult, ticketsResult]) {
    if (result.error) throw result.error;
  }

  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  // Fetch tenant emails for context
  const tenantIds = Array.from(
    new Set(
      (tickets ?? []).map((t) => t.tenant_profile_id).filter((id): id is string => id !== null),
    ),
  );

  const ticketRows = tickets ?? [];
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const [profilesResult, enhancementMaps, commentMaps, timelineMaps] = await Promise.all([
    tenantIds.length > 0
      ? supabase.from("profiles").select("id, email").in("id", tenantIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string }>, error: null }),
    buildTicketEnhancementMaps(supabase, ticketIds),
    buildCommentMaps(supabase, ticketIds),
    buildTimelineMaps(supabase, ticketIds),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  const profileById = new Map<string, { email: string }>(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId,
  } = enhancementMaps;
  const { commentCountByTicketId, commentsByTicketId } = commentMaps;
  const { timelineByTicketId } = timelineMaps;

  return ticketRows.map((ticket) => {
    const property = propertyById.get(ticket.property_id);
    const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
    const tenant = ticket.tenant_profile_id ? profileById.get(ticket.tenant_profile_id) : null;
    const assignment = assignmentByTicketId.get(ticket.id);

    return {
      id: ticket.id,
      propertyId: ticket.property_id,
      propertyName: property?.name ?? "Unknown Property",
      unitNumber: unit?.unit_number ?? null,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status as MaintenanceTicket["status"],
      priority: ticket.priority as MaintenanceTicket["priority"],
      actualCostCents: ticket.actual_cost_cents,
      vendorName: assignment ? (vendorNameById.get(assignment.vendorId) ?? null) : null,
      assignmentStatus: assignment?.status ?? null,
      photoCount: photoCountByTicketId.get(ticket.id) ?? 0,
      latestPhotoId: latestPhotoIdByTicketId.get(ticket.id) ?? null,
      photos: photosByTicketId.get(ticket.id) ?? [],
      createdAt: ticket.created_at,
      resolvedAt: ticket.resolved_at,
      tenantEmail: tenant?.email ?? null,
      commentCount: commentCountByTicketId.get(ticket.id) ?? 0,
      comments: commentsByTicketId.get(ticket.id) ?? [],
      timeline: timelineByTicketId.get(ticket.id) ?? [],
      isFeatureReady: true,
      featureWarning: null,
    };
  });
}
