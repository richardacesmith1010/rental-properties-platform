import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataRow } from "@/components/shared/data-row";
import { EmptyState } from "@/components/shared/empty-state";
import { TicketStatusControl } from "./ticket-status-control";
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
}: MaintenanceSectionProps) {
  return (
    <Card id="maintenance">
      <CardHeader>
        <CardTitle>Maintenance Tickets</CardTitle>
      </CardHeader>
      <CardContent>
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
                  </p>
                </div>

                {showControls && onUpdateStatus && (
                  <div className="flex-shrink-0">
                    <TicketStatusControl
                      ticketId={ticket.id}
                      currentStatus={ticket.status}
                      onUpdateStatus={onUpdateStatus}
                    />
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
