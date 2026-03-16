import Link from "next/link";
import { MessageSquareText, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketStatusControl } from "./ticket-status-control";
import { TicketVendorControl } from "./ticket-vendor-control";
import { TicketPhotoUpload } from "./ticket-photo-upload";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MaintenanceCommentThread } from "./maintenance-comment-thread";
import { MaintenanceTracker } from "./maintenance-tracker";
import { AnimatedList } from "@/components/ui/animated-list";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { ActionState } from "@/app/actions";
import { formatCurrency, formatDate } from "@/lib/format";
import { getStatusClasses, statusBadgeClasses } from "@/lib/status-colors";

type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

interface MaintenanceSectionProps {
  tickets: MaintenanceTicket[];
  showControls?: boolean;
  onUpdateStatus?: StatefulAction;
  vendors?: Array<{ id: string; name: string; preferred?: boolean }>;
  onAssignVendor?: StatefulAction;
  onUploadPhoto?: StatefulAction;
  onAddComment?: StatefulAction;
  vendorWorkflowEnabled?: boolean;
  photoWorkflowEnabled?: boolean;
  vendorWorkflowWarning?: string | null;
  photoWorkflowWarning?: string | null;
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

export function MaintenanceSection({
  tickets,
  showControls = false,
  onUpdateStatus,
  vendors = [],
  onAssignVendor,
  onUploadPhoto,
  onAddComment,
  vendorWorkflowEnabled = true,
  photoWorkflowEnabled = true,
  vendorWorkflowWarning = null,
  photoWorkflowWarning = null,
}: MaintenanceSectionProps) {
  return (
    <Card id="maintenance" className="border border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Maintenance Tickets</CardTitle>
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
        {tickets.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No maintenance tickets"
            description="Tickets submitted by tenants will appear here."
          />
        ) : (
          <AnimatedList>
            {tickets.map((ticket, i) => {
              const meta = ticketMeta(ticket);
              return (
                <DataRow key={ticket.id} last={i === tickets.length - 1}>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-zinc-900">
                      {ticket.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {ticket.propertyName}
                      {ticket.unitNumber ? ` • Unit ${ticket.unitNumber}` : ""}
                    </p>
                    {ticket.tenantEmail ? (
                      <p className="mt-0.5 text-sm text-zinc-400">
                        {ticket.tenantEmail}
                      </p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <span className={statusBadgeClasses(ticket.status)}>
                        <span
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
                    <div className="mt-2 grid gap-2 text-[11px] text-zinc-500 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-zinc-700">Created:</span> {meta.created}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-700">Resolved:</span> {meta.resolved}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p>
                          <span className="font-medium text-zinc-700">Cost:</span> {meta.cost}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-700">Vendor:</span> {meta.vendor}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-700">Assignment:</span> {meta.assignment}
                        </p>
                        <p>
                          <span className="font-medium text-zinc-700">Photos:</span> {meta.photos}
                          {ticket.photoCount > 0 && !photoWorkflowEnabled ? " (access unavailable)" : ""}
                        </p>
                      </div>
                    </div>

                    {(ticket.commentCount > 0 || onAddComment) ? (
                      <details className="mt-4 rounded-2xl border border-border/50 bg-zinc-50/70 shadow-sm">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-700">
                          <span className="inline-flex items-center gap-2">
                            <MessageSquareText className="h-4 w-4 text-zinc-400" />
                            Conversation
                            <span className="text-zinc-400">({ticket.commentCount})</span>
                          </span>
                        </summary>
                        <div className="border-t border-zinc-200 px-4 py-4">
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

                  {(showControls || (photoWorkflowEnabled && ticket.latestPhotoId)) ? (
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
                      {showControls && onUploadPhoto && photoWorkflowEnabled ? (
                        <TicketPhotoUpload
                          ticketId={ticket.id}
                          onUploadPhoto={onUploadPhoto}
                        />
                      ) : null}
                      {photoWorkflowEnabled && ticket.latestPhotoId ? (
                        <Link
                          href={`/api/assets/maintenance-photo/${ticket.latestPhotoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
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
        )}
      </CardContent>
    </Card>
  );
}
