import { createClient } from "@/lib/supabase/server";

export interface MaintenanceTicket {
  id: string;
  propertyName: string;
  unitNumber: string | null;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  actualCostCents: number | null;
  vendorName: string | null;
  assignmentStatus: "assigned" | "reassigned" | "cancelled" | null;
  photoCount: number;
  createdAt: string;
  resolvedAt: string | null;
  tenantEmail: string | null;
}

export interface TenantUnit {
  id: string;
  unitNumber: string;
  propertyName: string;
}

export interface TenantMaintenanceData {
  tickets: MaintenanceTicket[];
  units: TenantUnit[];
}

async function buildTicketEnhancementMaps(
  supabase: ReturnType<typeof createClient>,
  ticketIds: string[]
) {
  const assignmentByTicketId = new Map<
    string,
    { vendorId: string; status: "assigned" | "reassigned" | "cancelled" }
  >();
  const vendorNameById = new Map<string, string>();
  const photoCountByTicketId = new Map<string, number>();

  if (ticketIds.length === 0) {
    return { assignmentByTicketId, vendorNameById, photoCountByTicketId };
  }

  const { data: assignments } = await supabase
    .from("maintenance_assignments")
    .select("ticket_id, vendor_id, status, assigned_at")
    .in("ticket_id", ticketIds)
    .order("assigned_at", { ascending: false });

  for (const assignment of assignments ?? []) {
    if (!assignmentByTicketId.has(assignment.ticket_id)) {
      assignmentByTicketId.set(assignment.ticket_id, {
        vendorId: assignment.vendor_id,
        status: assignment.status as "assigned" | "reassigned" | "cancelled"
      });
    }
  }

  const vendorIds = Array.from(
    new Set((assignments ?? []).map((assignment) => assignment.vendor_id))
  );
  if (vendorIds.length > 0) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("id, name")
      .in("id", vendorIds);

    for (const vendor of vendors ?? []) {
      vendorNameById.set(vendor.id, vendor.name);
    }
  }

  const { data: photos } = await supabase
    .from("maintenance_photos")
    .select("ticket_id")
    .in("ticket_id", ticketIds);

  for (const photo of photos ?? []) {
    photoCountByTicketId.set(
      photo.ticket_id,
      (photoCountByTicketId.get(photo.ticket_id) ?? 0) + 1
    );
  }

  return { assignmentByTicketId, vendorNameById, photoCountByTicketId };
}

/* ─── Tenant: tickets + available units for the create form ─── */

export async function getTenantMaintenanceData(
  userId: string
): Promise<TenantMaintenanceData> {
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

  const propertyIds = Array.from(
    new Set((units ?? []).map((unit) => unit.property_id))
  );

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);

  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, p])
  );
  const unitById = new Map(
    (units ?? []).map((u) => [u.id, u])
  );

  // Build the units list for the ticket form dropdown
  const tenantUnits: TenantUnit[] = (units ?? []).map((unit) => ({
    id: unit.id,
    unitNumber: unit.unit_number,
    propertyName: propertyById.get(unit.property_id)?.name ?? "Unknown Property",
  }));

  // Fetch tenant's maintenance tickets
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select("id, property_id, unit_id, title, description, status, priority, actual_cost_cents, created_at, resolved_at")
    .eq("tenant_profile_id", userId)
    .order("created_at", { ascending: false });

  const ticketRows = tickets ?? [];
  const { assignmentByTicketId, vendorNameById, photoCountByTicketId } =
    await buildTicketEnhancementMaps(
      supabase,
      ticketRows.map((ticket) => ticket.id)
    );

  return {
    units: tenantUnits,
    tickets: ticketRows.map((ticket) => {
      const property = propertyById.get(ticket.property_id);
      const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
      const assignment = assignmentByTicketId.get(ticket.id);

      return {
        id: ticket.id,
        propertyName: property?.name ?? "Unknown Property",
        unitNumber: unit?.unit_number ?? null,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status as MaintenanceTicket["status"],
        priority: ticket.priority as MaintenanceTicket["priority"],
        actualCostCents: ticket.actual_cost_cents,
        vendorName: assignment ? vendorNameById.get(assignment.vendorId) ?? null : null,
        assignmentStatus: assignment?.status ?? null,
        photoCount: photoCountByTicketId.get(ticket.id) ?? 0,
        createdAt: ticket.created_at,
        resolvedAt: ticket.resolved_at,
        tenantEmail: null,
      };
    }),
  };
}

/* ─── Owner: all tickets across owned properties ─── */

export async function getOwnerMaintenanceTickets(
  userId: string
): Promise<MaintenanceTicket[]> {
  const supabase = createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .eq("owner_profile_id", userId);

  const propertyIds = (properties ?? []).map((p) => p.id);

  if (propertyIds.length === 0) {
    return [];
  }

  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, p])
  );

  // Fetch units for label display
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .in("property_id", propertyIds);

  const unitById = new Map(
    (units ?? []).map((u) => [u.id, u])
  );

  // Fetch tickets
  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select(
      "id, property_id, unit_id, tenant_profile_id, title, description, status, priority, actual_cost_cents, created_at, resolved_at"
    )
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false });

  // Fetch tenant emails for context
  const tenantIds = Array.from(
    new Set(
      (tickets ?? [])
        .map((t) => t.tenant_profile_id)
        .filter((id): id is string => id !== null)
    )
  );

  let profileById = new Map<string, { email: string }>();
  if (tenantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", tenantIds);

    profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p])
    );
  }

  const ticketRows = tickets ?? [];
  const { assignmentByTicketId, vendorNameById, photoCountByTicketId } =
    await buildTicketEnhancementMaps(
      supabase,
      ticketRows.map((ticket) => ticket.id)
    );

  return ticketRows.map((ticket) => {
    const property = propertyById.get(ticket.property_id);
    const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
    const tenant = ticket.tenant_profile_id
      ? profileById.get(ticket.tenant_profile_id)
      : null;
    const assignment = assignmentByTicketId.get(ticket.id);

    return {
      id: ticket.id,
      propertyName: property?.name ?? "Unknown Property",
      unitNumber: unit?.unit_number ?? null,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status as MaintenanceTicket["status"],
      priority: ticket.priority as MaintenanceTicket["priority"],
      actualCostCents: ticket.actual_cost_cents,
      vendorName: assignment ? vendorNameById.get(assignment.vendorId) ?? null : null,
      assignmentStatus: assignment?.status ?? null,
      photoCount: photoCountByTicketId.get(ticket.id) ?? 0,
      createdAt: ticket.created_at,
      resolvedAt: ticket.resolved_at,
      tenantEmail: tenant?.email ?? null,
    };
  });
}

/* ─── Manager: tickets for assigned properties ─── */

export async function getManagerMaintenanceTickets(
  userId: string
): Promise<MaintenanceTicket[]> {
  const supabase = createClient();

  const { data: assignments } = await supabase
    .from("property_managers")
    .select("property_id")
    .eq("manager_profile_id", userId)
    .eq("active", true);

  const propertyIds = (assignments ?? []).map((a) => a.property_id);

  if (propertyIds.length === 0) {
    return [];
  }

  const { data: properties } = await supabase
    .from("properties")
    .select("id, name")
    .in("id", propertyIds);

  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, p])
  );

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number")
    .in("property_id", propertyIds);

  const unitById = new Map(
    (units ?? []).map((u) => [u.id, u])
  );

  const { data: tickets } = await supabase
    .from("maintenance_tickets")
    .select(
      "id, property_id, unit_id, tenant_profile_id, title, description, status, priority, actual_cost_cents, created_at, resolved_at"
    )
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false });

  const tenantIds = Array.from(
    new Set(
      (tickets ?? [])
        .map((t) => t.tenant_profile_id)
        .filter((id): id is string => id !== null)
    )
  );

  let profileById = new Map<string, { email: string }>();
  if (tenantIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", tenantIds);

    profileById = new Map(
      (profiles ?? []).map((p) => [p.id, p])
    );
  }

  const ticketRows = tickets ?? [];
  const { assignmentByTicketId, vendorNameById, photoCountByTicketId } =
    await buildTicketEnhancementMaps(
      supabase,
      ticketRows.map((ticket) => ticket.id)
    );

  return ticketRows.map((ticket) => {
    const property = propertyById.get(ticket.property_id);
    const unit = ticket.unit_id ? unitById.get(ticket.unit_id) : null;
    const tenant = ticket.tenant_profile_id
      ? profileById.get(ticket.tenant_profile_id)
      : null;
    const assignment = assignmentByTicketId.get(ticket.id);

    return {
      id: ticket.id,
      propertyName: property?.name ?? "Unknown Property",
      unitNumber: unit?.unit_number ?? null,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status as MaintenanceTicket["status"],
      priority: ticket.priority as MaintenanceTicket["priority"],
      actualCostCents: ticket.actual_cost_cents,
      vendorName: assignment ? vendorNameById.get(assignment.vendorId) ?? null : null,
      assignmentStatus: assignment?.status ?? null,
      photoCount: photoCountByTicketId.get(ticket.id) ?? 0,
      createdAt: ticket.created_at,
      resolvedAt: ticket.resolved_at,
      tenantEmail: tenant?.email ?? null,
    };
  });
}
