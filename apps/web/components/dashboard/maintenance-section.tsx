"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MessageSquareText, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataRow } from "@/components/shared/data-row";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketStatusControl } from "./ticket-status-control";
import { TicketVendorControl } from "./ticket-vendor-control";
import { TicketPhotoUpload } from "./ticket-photo-upload";
import { PhotoGallery } from "./maintenance/photo-gallery";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MaintenanceCommentThread } from "./maintenance-comment-thread";
import { MaintenanceTracker } from "./maintenance-tracker";
import { AnimatedList } from "@/components/ui/animated-list";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { getStatusClasses, statusAriaLabel, statusBadgeClasses } from "@/lib/status-colors";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;
type MaintenanceFilter = "active" | "completed" | "all";

interface MaintenanceSectionProps {
  tickets: MaintenanceTicket[];
  showControls?: boolean;
  currentUserId?: string;
  viewerRole?: "owner" | "manager" | "tenant";
  onUpdateStatus?: StatefulAction;
  vendors?: Array<{ id: string; name: string; preferred?: boolean }>;
  onAssignVendor?: StatefulAction;
  onUploadPhoto?: StatefulAction;
  onDeletePhoto?: StatefulAction;
  onAddComment?: StatefulAction;
  vendorWorkflowEnabled?: boolean;
  photoWorkflowEnabled?: boolean;
  vendorWorkflowWarning?: string | null;
  photoWorkflowWarning?: string | null;
  previewCount?: number;
}

const priorityVariant: Record<string, "destructive" | "warning" | "default" | "outline"> = {
  urgent: "destructive",
  high: "warning",
  medium: "default",
  low: "outline",
};

function statusLabel(status: string): string {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ticketMeta(ticket: MaintenanceTicket) {
  return {
    created: formatDate(ticket.createdAt),
    resolved: ticket.resolvedAt ? formatDate(ticket.resolvedAt) : "Not resolved",
    cost: ticket.actualCostCents != null ? formatCurrency(ticket.actualCostCents) : "Not recorded",
    vendor: ticket.vendorName ?? "Unassigned",
    assignment: ticket.assignmentStatus ? statusLabel(ticket.assignmentStatus) : "Not assigned",
    photos:
      ticket.photoCount > 0
        ? `${ticket.photoCount} photo${ticket.photoCount === 1 ? "" : "s"}`
        : "No photos"
  };
}

function isActiveMaintenanceStatus(status: MaintenanceTicket["status"]) {
  return status === "open" || status === "in_progress";
}

function isCompletedMaintenanceStatus(status: MaintenanceTicket["status"]) {
  return status === "resolved" || status === "closed";
}

function emptyStateMessage(filter: MaintenanceFilter) {
  if (filter === "active") {
    return "No active tickets right now.";
  }

  if (filter === "completed") {
    return "No completed tickets yet.";
  }

  return "No tickets yet.";
}

export function MaintenanceSection({
  tickets,
  showControls = false,
  currentUserId,
  viewerRole,
  onUpdateStatus,
  vendors = [],
  onAssignVendor,
  onUploadPhoto,
  onDeletePhoto,
  onAddComment,
  vendorWorkflowEnabled = true,
  photoWorkflowEnabled = true,
  vendorWorkflowWarning = null,
  photoWorkflowWarning = null,
  previewCount,
}: MaintenanceSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<MaintenanceFilter>("active");
  const filteredTickets = useMemo(() => {
    if (filter === "active") {
      return tickets.filter((ticket) => isActiveMaintenanceStatus(ticket.status));
    }

    if (filter === "completed") {
      return tickets.filter((ticket) => isCompletedMaintenanceStatus(ticket.status));
    }

    return tickets;
  }, [filter, tickets]);
  const activeCount = useMemo(
    () => tickets.filter((ticket) => isActiveMaintenanceStatus(ticket.status)).length,
    [tickets]
  );
  const completedCount = useMemo(
    () => tickets.filter((ticket) => isCompletedMaintenanceStatus(ticket.status)).length,
    [tickets]
  );
  const totalCount = tickets.length;
  const canDeleteTicketPhoto = (uploadedBy: string) => {
    if (!currentUserId) {
      return false;
    }

    return viewerRole === "owner" || uploadedBy === currentUserId;
  };
  const visibleTickets =
    previewCount && !expanded ? filteredTickets.slice(0, previewCount) : filteredTickets;
  const hasMore = previewCount != null && filteredTickets.length > previewCount;
  const sectionTitle = viewerRole === "tenant" ? "Problems" : "Maintenance Tickets";
  const emptyDescription =
    filter === "all"
      ? viewerRole === "tenant"
        ? "Problems you report will show up here with status updates from your landlord."
        : "Tickets submitted by tenants will appear here."
      : viewerRole === "tenant"
        ? "Switch filters to review your other maintenance updates."
        : "Switch filters to review the rest of your ticket history.";

  return (
    <Card id="maintenance" className="border border-border/50 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-xl font-semibold">{sectionTitle}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={filter === "active" ? "default" : "outline"}
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
            title="Show open and in-progress tickets."
          >
            Active ({activeCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "completed" ? "default" : "outline"}
            aria-pressed={filter === "completed"}
            onClick={() => setFilter("completed")}
            title="Show resolved and closed tickets."
          >
            Completed ({completedCount})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            title="Show every maintenance ticket."
          >
            All ({totalCount})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {(vendorWorkflowWarning || photoWorkflowWarning) && (
          <div className="mb-4 space-y-2">
            {vendorWorkflowWarning ? (
              <FeatureWarning
                title="Vendor Workflow Unavailable"
                message={vendorWorkflowWarning}
              />
            ) : null}
            {photoWorkflowWarning ? (
              <FeatureWarning
                title="Photo Workflow Unavailable"
                message={photoWorkflowWarning}
              />
            ) : null}
          </div>
        )}
        {filteredTickets.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={emptyStateMessage(filter)}
            description={emptyDescription}
          />
        ) : (
          <>
            <AnimatedList>
              {visibleTickets.map((ticket, i) => {
              const meta = ticketMeta(ticket);
              return (
                <DataRow key={ticket.id} last={i === visibleTickets.length - 1}>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-foreground">
                      {ticket.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {ticket.propertyName}
                      {ticket.unitNumber ? ` • ${ticket.unitNumber}` : ""}
                    </p>
                    {ticket.tenantEmail ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {ticket.tenantEmail}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span
                        className={statusBadgeClasses(ticket.status)}
                        aria-label={statusAriaLabel(ticket.status, "Ticket status")}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${getStatusClasses(ticket.status).dot}`}
                        />
                        {statusLabel(ticket.status)}
                      </span>
                      <Badge variant={priorityVariant[ticket.priority] ?? "outline"}>
                        {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                      </Badge>
                      <Badge variant="outline">
                        {ticket.commentCount} comment{ticket.commentCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-foreground">Created:</span> {meta.created}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Resolved:</span> {meta.resolved}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-foreground">Cost:</span> {meta.cost}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Vendor:</span> {meta.vendor}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Assignment:</span> {meta.assignment}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Photos:</span> {meta.photos}
                          {ticket.photoCount > 0 && !photoWorkflowEnabled ? " (access unavailable)" : ""}
                        </p>
                      </div>
                    </div>

                    {ticket.photos.length > 0 ? (
                      <div className="mt-4">
                        <PhotoGallery
                          photos={ticket.photos}
                          canDeletePhoto={
                            onDeletePhoto
                              ? (photo) => canDeleteTicketPhoto(photo.uploadedBy)
                              : undefined
                          }
                          onDelete={
                            onDeletePhoto
                              ? async (photoId) => {
                                  const formData = new FormData();
                                  formData.append("photoId", photoId);
                                  const result = await onDeletePhoto(null, formData);
                                  if (!result?.success) {
                                    throw new Error(result?.error ?? "Unable to delete this photo right now.");
                                  }
                                }
                              : undefined
                          }
                        />
                      </div>
                    ) : null}

                    {(ticket.commentCount > 0 || onAddComment) ? (
                      <details className="mt-4 rounded-2xl border border-border bg-card/70 shadow-sm">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
                          <span className="inline-flex items-center gap-2">
                            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                            Conversation
                            <span className="text-muted-foreground">({ticket.commentCount})</span>
                          </span>
                        </summary>
                        <div className="border-t border-border px-4 py-4">
                          <div className="mb-4">
                            <MaintenanceTracker
                              currentStatus={ticket.status}
                              timeline={ticket.timeline}
                              ticketCreatedAt={ticket.createdAt}
                            />
                          </div>
                          {onAddComment ? (
                            <MaintenanceCommentThread
                              ticketId={ticket.id}
                              comments={ticket.comments}
                              onAddComment={onAddComment}
                              canAddInternal={showControls}
                            />
                          ) : (
                            <EmptyState
                              icon={MessageSquareText}
                              title="Comments unavailable"
                              description="Conversation tools are not available for this ticket right now."
                            />
                          )}
                        </div>
                      </details>
                    ) : null}
                  </div>

                  {(showControls || Boolean(onUploadPhoto) || (photoWorkflowEnabled && ticket.latestPhotoId)) ? (
                    <div className="flex-shrink-0 space-y-2">
                      {showControls && onUpdateStatus ? (
                        <TicketStatusControl
                          ticketId={ticket.id}
                          currentStatus={ticket.status}
                          onUpdateStatus={onUpdateStatus}
                        />
                      ) : null}
                      {showControls && onAssignVendor && vendorWorkflowEnabled && vendors.length > 0 ? (
                        <TicketVendorControl
                          ticketId={ticket.id}
                          vendors={vendors}
                          onAssignVendor={onAssignVendor}
                        />
                      ) : null}
                      {onUploadPhoto && photoWorkflowEnabled ? (
                        <TicketPhotoUpload
                          ticketId={ticket.id}
                          existingPhotos={ticket.photos}
                          onUploadPhoto={onUploadPhoto}
                        />
                      ) : null}
                      {photoWorkflowEnabled && ticket.latestPhotoId ? (
                        <Link
                          href={`/api/assets/maintenance-photo/${ticket.latestPhotoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"
                          title="Open the latest maintenance photo for this ticket."
                        >
                          View Photo
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </DataRow>
              );
              })}
            </AnimatedList>
            {hasMore ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  title={expanded ? "Collapse the maintenance ticket preview." : "Show the full maintenance ticket list."}
                >
                  {expanded ? "Show Less" : `View All Tickets (${filteredTickets.length})`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
