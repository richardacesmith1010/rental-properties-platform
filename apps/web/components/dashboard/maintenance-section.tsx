import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { TicketStatusControl } from "./ticket-status-control";
import { TicketVendorControl } from "./ticket-vendor-control";
import { TicketPhotoUpload } from "./ticket-photo-upload";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { ActionState } from "@/app/actions";

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
  vendorWorkflowEnabled?: boolean;
  photoWorkflowEnabled?: boolean;
  vendorWorkflowWarning?: string | null;
  photoWorkflowWarning?: string | null;
}

const statusVariant: Record<string, "warning" | "default" | "success" | "outline"> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "outline",
};

const priorityVariant: Record<string, "destructive" | "warning" | "default" | "outline"> = {
  urgent: "destructive",
  high: "warning",
  medium: "default",
  low: "outline",
};

function statusLabel(status: string): string {
  return status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MaintenanceSection({
  tickets,
  showControls = false,
  onUpdateStatus,
  vendors = [],
  onAssignVendor,
  onUploadPhoto,
  vendorWorkflowEnabled = true,
  photoWorkflowEnabled = true,
  vendorWorkflowWarning = null,
  photoWorkflowWarning = null,
}: MaintenanceSectionProps) {
  return (
    <Card id="maintenance">
      <CardHeader>
        <CardTitle>Maintenance Tickets</CardTitle>
      </CardHeader>
      <CardContent>
        {(vendorWorkflowWarning || photoWorkflowWarning) && (
          <div className="mb-4 space-y-2">
            {vendorWorkflowWarning && (
              <FeatureWarning
                title="Vendor Workflow Unavailable"
                message={vendorWorkflowWarning}
              />
            )}
            {photoWorkflowWarning && (
              <FeatureWarning
                title="Photo Workflow Unavailable"
                message={photoWorkflowWarning}
              />
            )}
          </div>
        )}
        {tickets.length === 0 ? (
          <EmptyState message="No maintenance tickets yet." />
        ) : (
          <div>
            {tickets.map((ticket, i) => (
              <DataRow key={ticket.id} last={i === tickets.length - 1}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {ticket.title}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {ticket.propertyName}
                    {ticket.unitNumber ? ` \u2022 Unit ${ticket.unitNumber}` : ""}
                  </p>
                  {ticket.tenantEmail && (
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {ticket.tenantEmail}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant={statusVariant[ticket.status] ?? "outline"}>
                      {statusLabel(ticket.status)}
                    </Badge>
                    <Badge variant={priorityVariant[ticket.priority] ?? "outline"}>
                      {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {new Date(ticket.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    {ticket.resolvedAt &&
                      ` \u2022 Resolved ${new Date(ticket.resolvedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}`}
                    {ticket.actualCostCents != null &&
                      ` \u2022 Cost: $${(ticket.actualCostCents / 100).toLocaleString()}`}
                    {ticket.vendorName && ` \u2022 Vendor: ${ticket.vendorName}`}
                    {ticket.assignmentStatus &&
                      ` \u2022 ${statusLabel(ticket.assignmentStatus)}`}
                    {ticket.photoCount > 0 &&
                      ` \u2022 ${ticket.photoCount} photo${ticket.photoCount === 1 ? "" : "s"}`}
                    {ticket.photoCount > 0 &&
                      !photoWorkflowEnabled &&
                      " \u2022 Photo access unavailable"}
                  </p>
                </div>

                {(showControls || (photoWorkflowEnabled && ticket.latestPhotoId)) && (
                  <div className="flex-shrink-0 space-y-2">
                    {showControls && onUpdateStatus && (
                      <TicketStatusControl
                        ticketId={ticket.id}
                        currentStatus={ticket.status}
                        onUpdateStatus={onUpdateStatus}
                      />
                    )}
                    {showControls && onAssignVendor && vendorWorkflowEnabled && vendors.length > 0 && (
                      <TicketVendorControl
                        ticketId={ticket.id}
                        vendors={vendors}
                        onAssignVendor={onAssignVendor}
                      />
                    )}
                    {showControls && onUploadPhoto && photoWorkflowEnabled && (
                      <TicketPhotoUpload
                        ticketId={ticket.id}
                        onUploadPhoto={onUploadPhoto}
                      />
                    )}
                    {photoWorkflowEnabled && ticket.latestPhotoId && (
                      <Link
                        href={`/api/assets/maintenance-photo/${ticket.latestPhotoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        View Photo
                      </Link>
                    )}
                  </div>
                )}
              </DataRow>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
