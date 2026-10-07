import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeMaintenancePhotoRecord } from "@/lib/maintenance-photos";
import { isMissingSchemaError } from "@/lib/supabase-errors";

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

type SupabaseLikeClient = Pick<ReturnType<typeof createClient>, "from">;

export async function buildCommentMaps(supabase: SupabaseLikeClient, ticketIds: string[]) {
  const commentCountByTicketId = new Map<string, number>();
  const commentsByTicketId = new Map<string, MaintenanceComment[]>();

  if (ticketIds.length === 0) {
    return {
      commentCountByTicketId,
      commentsByTicketId,
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
        commentsByTicketId,
      };
    }

    throw error;
  }

  const commentRows = (comments ?? []) as Array<{
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
          role: author.role,
        },
      ]),
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
      createdAt: comment.created_at,
    });
    commentsByTicketId.set(comment.ticket_id, existing);
    commentCountByTicketId.set(comment.ticket_id, existing.length);
  }

  return {
    commentCountByTicketId,
    commentsByTicketId,
  };
}

export async function buildTimelineMaps(supabase: SupabaseLikeClient, ticketIds: string[]) {
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

  const historyRows = (history ?? []) as Array<{
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
        .filter((authorId): authorId is string => Boolean(authorId)),
    ),
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
          email: author.email,
        },
      ]),
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
        author?.nickname?.trim() || author?.full_name?.trim() || author?.email || "Domus",
      notes: row.notes,
      createdAt: row.created_at,
    });
    timelineByTicketId.set(row.ticket_id, current);
  }

  return { timelineByTicketId };
}

export async function getMaintenanceTimeline(
  supabase: SupabaseLikeClient,
  ticketId: string,
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
  notes?: string,
): Promise<void> {
  const { error } = await supabase.from("maintenance_status_history").insert({
    ticket_id: ticketId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    notes: notes ?? null,
  });

  if (error && !isMissingSchemaError(error)) {
    console.error("Failed to log maintenance status change:", error);
  }
}

export async function buildTicketEnhancementMaps(
  supabase: ReturnType<typeof createClient>,
  ticketIds: string[],
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
      photosByTicketId,
    };
  }

  const photoSelect =
    "id, ticket_id, uploaded_by_profile_id, storage_path, caption, created_at, file_name, file_type, file_size_bytes";
  const photoFallbackSelect =
    "id, ticket_id, uploaded_by_profile_id, storage_path, caption, created_at";
  const [assignmentResult, photoQuery] = await Promise.all([
    supabase
      .from("maintenance_assignments")
      .select("ticket_id, vendor_id, status, assigned_at")
      .in("ticket_id", ticketIds)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("maintenance_photos")
      .select(photoSelect)
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false }),
  ]);
  if (assignmentResult.error && !isMissingSchemaError(assignmentResult.error)) {
    throw assignmentResult.error;
  }
  const assignments = assignmentResult.data;

  for (const assignment of assignments ?? []) {
    if (!assignmentByTicketId.has(assignment.ticket_id)) {
      assignmentByTicketId.set(assignment.ticket_id, {
        vendorId: assignment.vendor_id,
        status: assignment.status as "assigned" | "reassigned" | "cancelled",
      });
    }
  }

  const vendorIds = Array.from(
    new Set((assignments ?? []).map((assignment) => assignment.vendor_id)),
  );
  if (vendorIds.length > 0) {
    const { data: vendors, error: vendorError } = await supabase
      .from("vendors")
      .select("id, name")
      .in("id", vendorIds);
    if (vendorError && !isMissingSchemaError(vendorError)) throw vendorError;

    for (const vendor of vendors ?? []) {
      vendorNameById.set(vendor.id, vendor.name);
    }
  }

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
    photoCountByTicketId.set(photo.ticket_id, (photoCountByTicketId.get(photo.ticket_id) ?? 0) + 1);
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
        caption: "caption" in photo ? (photo.caption ?? null) : null,
        file_name: "file_name" in photo ? (photo.file_name ?? null) : null,
        file_type: "file_type" in photo ? (photo.file_type ?? null) : null,
        file_size_bytes: "file_size_bytes" in photo ? (photo.file_size_bytes ?? null) : null,
      }),
    );
    photosByTicketId.set(photo.ticket_id, ticketPhotos);
  }

  return {
    assignmentByTicketId,
    vendorNameById,
    photoCountByTicketId,
    latestPhotoIdByTicketId,
    photosByTicketId,
  };
}

/* ─── Tenant: tickets + available units for the create form ─── */
