import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeMaintenancePhotoRecord } from "@/lib/maintenance-photos";
import {
  getAdministeredPropertyIds,
  getAdministeredPropertyIdsForAccount
} from "@/lib/property-access";
import { isMissingSchemaError } from "@/lib/supabase-errors";

type SupabaseLikeClient = Pick<ReturnType<typeof createClient>, "from">;

export interface MaintenanceComment {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  ticketId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
  changedByName: string;
  notes: string | null;
  createdAt: string;
}

export interface MaintenancePhotoDTO {
  id: string;
  ticketId: string;
  uploadedBy: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
  caption?: string | null;
  url?: string;
}

export interface MaintenanceTicket {
  id: string;
  propertyId: string;
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
  latestPhotoId: string | null;
  photos: MaintenancePhotoDTO[];
  createdAt: string;
  resolvedAt: string | null;
  tenantEmail: string | null;
  commentCount: number;
  comments: MaintenanceComment[];
  timeline: StatusHistoryEntry[];
  isFeatureReady?: boolean;
  featureWarning?: string | null;
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

async function buildCommentMaps(
  supabase: SupabaseLikeClient,
  ticketIds: string[]
) {
  const commentCountByTicketId = new Map<string, number>();
  const commentsByTicketId = new Map<string, MaintenanceComment[]>();

  if (ticketIds.length === 0) {
    return {
      commentCountByTicketId,
      commentsByTicketId
    };
  }

  const { data: comments, error } = await supabase
    .from("maintenance_comments")
    .select("id, ticket_id, author_id, body, is_internal, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return {
        commentCountByTicketId,
        commentsByTicketId
      };
    }

    throw error;
  }

  const commentRows =
    (comments ?? []) as Array<{
      id: string;
      ticket_id: string;
      author_id: string;
      body: string;
      is_internal: boolean | null;
      created_at: string;
    }>;
  const authorIds = Array.from(new Set(commentRows.map((comment) => comment.author_id)));

  let authorById = new Map<
    string,
    {
      full_name: string | null;
      email: string | null;
      role: string | null;
    }
  >();

  if (authorIds.length > 0) {
    const admin = createAdminClient();
    const { data: authors } = await admin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", authorIds);

    authorById = new Map(
      (authors ?? []).map((author) => [
        author.id,
        {
          full_name: author.full_name,
          email: author.email,
          role: author.role
        }
      ])
    );
  }

  for (const comment of commentRows) {
    const existing = commentsByTicketId.get(comment.ticket_id) ?? [];
    const author = authorById.get(comment.author_id);
    existing.push({
      id: comment.id,
      ticketId: comment.ticket_id,
      authorId: comment.author_id,
      authorName: author?.full_name?.trim() || author?.email || "Domus User",
      authorRole: author?.role ?? "team",
      body: comment.body,
      isInternal: comment.is_internal === true,
      createdAt: comment.created_at
    });
    commentsByTicketId.set(comment.ticket_id, existing);
    commentCountByTicketId.set(comment.ticket_id, existing.length);
  }

  return {
    commentCountByTicketId,
    commentsByTicketId
  };
}

async function buildTimelineMaps(
  supabase: SupabaseLikeClient,
  ticketIds: string[]
) {
  const timelineByTicketId = new Map<string, StatusHistoryEntry[]>();

  if (ticketIds.length === 0) {
    return { timelineByTicketId };
  }

  const { data: history, error } = await supabase
    .from("maintenance_status_history")
    .select("id, ticket_id, from_status, to_status, changed_by, notes, created_at")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingSchemaError(error)) {
      return { timelineByTicketId };
    }

    throw error;
  }

  const historyRows =
    (history ?? []) as Array<{
      id: string;
      ticket_id: string;
      from_status: string | null;
      to_status: string;
      changed_by: string | null;
      notes: string | null;
      created_at: string;
    }>;

  const authorIds = Array.from(
    new Set(
      historyRows
        .map((row) => row.changed_by)
        .filter((authorId): authorId is string => Boolean(authorId))
    )
  );

  let authorById = new Map<
    string,
    {
      full_name: string | null;
      nickname: string | null;
      email: string | null;
    }
  >();

  if (authorIds.length > 0) {
    const admin = createAdminClient();
    const { data: authors } = await admin
      .from("profiles")
      .select("id, full_name, nickname, email")
      .in("id", authorIds);

    authorById = new Map(
      (authors ?? []).map((author) => [
        author.id,
        {
          full_name: author.full_name,
          nickname: author.nickname,
          email: author.email
        }
      ])
    );
  }

  for (const row of historyRows) {
    const current = timelineByTicketId.get(row.ticket_id) ?? [];
    const author = row.changed_by ? authorById.get(row.changed_by) : null;
    current.push({
      id: row.id,
      ticketId: row.ticket_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      changedBy: row.changed_by,
      changedByName:
        author?.nickname?.trim() ||
        author?.full_name?.trim() ||
        author?.email ||
        "Domus",
      notes: row.notes,
      createdAt: row.created_at
    });
    timelineByTicketId.set(row.ticket_id, current);
  }

  return { timelineByTicketId };
}

export async function getTicketComments(ticketId: string): Promise<MaintenanceComment[]> {
  const supabase = createClient();
  const { commentsByTicketId } = await buildCommentMaps(supabase, [ticketId]);
  return commentsByTicketId.get(ticketId) ?? [];
}

export async function getMaintenanceTimeline(
  supabase: SupabaseLikeClient,
  ticketId: string
): Promise<StatusHistoryEntry[]> {
  const { timelineByTicketId } = await buildTimelineMaps(supabase, [ticketId]);
  return timelineByTicketId.get(ticketId) ?? [];
}

export async function logMaintenanceStatusChange(
  supabase: SupabaseLikeClient,
  ticketId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase.from("maintenance_status_history").insert({
    ticket_id: ticketId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    notes: notes ?? null
  });

  if (error && !isMissingSchemaError(error)) {
    console.error("Failed to log maintenance status change:", error);
  }
}

async function buildTicketEnhancementMaps(
  supabase: ReturnType<typeof createClient>,
  ticketIds: string[]
) {
  type MaintenancePhotoRow = {
    id: string;
    ticket_id: string;
    uploaded_by_profile_id: string;
    storage_path: string;
    caption?: string | null;
    created_at: string;
    file_name?: string | null;
    file_type?: string | null;
    file_size_bytes?: number | null;
  };

  const assignmentByTicketId = new Map<
    string,
    { vendorId: string; status: "assigned" | "reassigned" | "cancelled" }
  >();
  const vendorNameById = new Map<string, string>();
  const photoCountByTicketId = new Map<string, number>();
  const latestPhotoIdByTicketId = new Map<string, string>();
  const photosByTicketId = new Map<string, MaintenancePhotoDTO[]>();

  if (ticketIds.length === 0) {
    return {
      assignmentByTicketId,
      vendorNameById,
      photoCountByTicketId,
      latestPhotoIdByTicketId,
      photosByTicketId
    };
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

  const photoSelect =
    "id, ticket_id, uploaded_by_profile_id, storage_path, caption, created_at, file_name, file_type, file_size_bytes";
  const photoFallbackSelect =
    "id, ticket_id, uploaded_by_profile_id, storage_path, caption, created_at";
  const photoQuery = await supabase
    .from("maintenance_photos")
    .select(photoSelect)
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false });

  let photos: MaintenancePhotoRow[] = (photoQuery.data ?? []) as MaintenancePhotoRow[];
  if (photoQuery.error) {
    if (!isMissingSchemaError(photoQuery.error)) {
      throw photoQuery.error;
    }

    const fallbackQuery = await supabase
      .from("maintenance_photos")
      .select(photoFallbackSelect)
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false });

    if (fallbackQuery.error) {
      if (!isMissingSchemaError(fallbackQuery.error)) {
        throw fallbackQuery.error;
      }
      photos = [];
    } else {
      photos = (fallbackQuery.data ?? []) as MaintenancePhotoRow[];
    }
  }

  for (const photo of photos) {
    photoCountByTicketId.set(
      photo.ticket_id,
      (photoCountByTicketId.get(photo.ticket_id) ?? 0) + 1
    );
    if (!latestPhotoIdByTicketId.has(photo.ticket_id)) {
      latestPhotoIdByTicketId.set(photo.ticket_id, photo.id);
    }

    const ticketPhotos = photosByTicketId.get(photo.ticket_id) ?? [];
    ticketPhotos.push(
      normalizeMaintenancePhotoRecord({
        id: photo.id,
        ticket_id: photo.ticket_id,
        uploaded_by_profile_id: photo.uploaded_by_profile_id,
        storage_path: photo.storage_path,
        created_at: photo.created_at,
        caption: "caption" in photo ? photo.caption ?? null : null,
        file_name: "file_name" in photo ? photo.file_name ?? null : null,
        file_type: "file_type" in photo ? photo.file_type ?? null : null,
        file_size_bytes: "file_size_bytes" in photo ? photo.file_size_bytes ?? null : null
      })
    );
    photosByTicketId.set(photo.ticket_id, ticketPhotos);
  }

  return {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId
  };
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
  const {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId
  } =
    await buildTicketEnhancementMaps(
      supabase,
      ticketRows.map((ticket) => ticket.id)
    );
  const {
    commentCountByTicketId,
    commentsByTicketId
  } = await buildCommentMaps(
    supabase,
    ticketRows.map((ticket) => ticket.id)
  );
  const { timelineByTicketId } = await buildTimelineMaps(
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
        propertyId: ticket.property_id,
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
        latestPhotoId: latestPhotoIdByTicketId.get(ticket.id) ?? null,
        photos: photosByTicketId.get(ticket.id) ?? [],
        createdAt: ticket.created_at,
        resolvedAt: ticket.resolved_at,
        tenantEmail: null,
        commentCount: commentCountByTicketId.get(ticket.id) ?? 0,
        comments: commentsByTicketId.get(ticket.id) ?? [],
        timeline: timelineByTicketId.get(ticket.id) ?? [],
        isFeatureReady: true,
        featureWarning: null
      };
    }),
  };
}

export async function getAdminMaintenanceTickets(
  userId: string,
  accountId?: string | null
): Promise<MaintenanceTicket[]> {
  const supabase = createAdminClient();
  const propertyIds = accountId
    ? await getAdministeredPropertyIdsForAccount(userId, accountId)
    : await getAdministeredPropertyIds(userId);

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
  const {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId
  } =
    await buildTicketEnhancementMaps(
      supabase,
      ticketRows.map((ticket) => ticket.id)
    );
  const {
    commentCountByTicketId,
    commentsByTicketId
  } = await buildCommentMaps(
    supabase,
    ticketRows.map((ticket) => ticket.id)
  );
  const { timelineByTicketId } = await buildTimelineMaps(
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
      propertyId: ticket.property_id,
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
        latestPhotoId: latestPhotoIdByTicketId.get(ticket.id) ?? null,
        photos: photosByTicketId.get(ticket.id) ?? [],
        createdAt: ticket.created_at,
      resolvedAt: ticket.resolved_at,
      tenantEmail: tenant?.email ?? null,
      commentCount: commentCountByTicketId.get(ticket.id) ?? 0,
      comments: commentsByTicketId.get(ticket.id) ?? [],
      timeline: timelineByTicketId.get(ticket.id) ?? [],
      isFeatureReady: true,
      featureWarning: null
    };
  });
}
