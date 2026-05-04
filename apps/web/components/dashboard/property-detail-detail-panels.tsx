"use client";

import Link from "next/link";
import { Receipt, Wrench } from "lucide-react";
import type { ActionState } from "@/app/actions";
import type { PropertyDetailData } from "@/lib/property-detail";
import { chargeCategoryLabel } from "@/lib/charge-audit";
import { formatCurrency, formatDate, pluralize } from "@/lib/format";
import { statusBadgeClasses } from "@/lib/status-colors";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MaintenanceCommentThread } from "@/components/dashboard/maintenance-comment-thread";
import { MaintenanceTracker } from "@/components/dashboard/maintenance-tracker";
import { TicketStatusControl } from "@/components/dashboard/ticket-status-control";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PaymentFilter = "all" | "pending" | "paid" | "late";
type MaintenanceFilter = "active" | "completed" | "all";
type StatefulAction = (
  prev: ActionState,
  formData: FormData
) => Promise<ActionState>;

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) =>
    character.toUpperCase()
  );
}

function documentCategoryLabel(value: string) {
  return labelize(value);
}

function lastUpdatedLabel(ticket: PropertyDetailData["maintenance"][number]) {
  return (
    ticket.timeline[ticket.timeline.length - 1]?.createdAt ??
    ticket.resolvedAt ??
    ticket.createdAt
  );
}

function FilterButton({
  active,
  label,
  title,
  onClick
}: {
  active: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      title={title}
    >
      {label}
    </Button>
  );
}

export function PropertyDetailPaymentsPanel({
  charges,
  filter,
  onFilterChange
}: {
  charges: PropertyDetailData["charges"];
  filter: PaymentFilter;
  onFilterChange: (filter: PaymentFilter) => void;
}) {
  const visibleCharges = charges.filter(
    (charge) => filter === "all" || charge.status === filter
  );

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-xl font-semibold">Payments</CardTitle>
        <div className="flex flex-wrap gap-2">
          <FilterButton
            active={filter === "all"}
            label="All"
            title="Show all charges for this property."
            onClick={() => onFilterChange("all")}
          />
          <FilterButton
            active={filter === "pending"}
            label="Pending"
            title="Show pending charges."
            onClick={() => onFilterChange("pending")}
          />
          <FilterButton
            active={filter === "paid"}
            label="Paid"
            title="Show paid charges."
            onClick={() => onFilterChange("paid")}
          />
          <FilterButton
            active={filter === "late"}
            label="Late"
            title="Show late charges."
            onClick={() => onFilterChange("late")}
          />
        </div>
      </CardHeader>
      <CardContent>
        {visibleCharges.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No charges to show"
            description="Charges and payment history for this property will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Tenant</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Charge type</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Due date</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Payment date</th>
                </tr>
              </thead>
              <tbody>
                {visibleCharges.map((charge) => (
                  <tr key={charge.id} className="border-b border-border/60 align-top">
                    <td className="px-3 py-3 font-medium text-foreground">
                      {charge.tenantName}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {charge.unitNumber}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {chargeCategoryLabel(charge.category)}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {formatCurrency(charge.amountCents)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDate(charge.dueDate)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={statusBadgeClasses(charge.status)}>
                        {labelize(charge.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {charge.paymentDate ? formatDate(charge.paymentDate) : "Not paid"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PropertyDetailMaintenancePanel({
  data,
  role,
  filter,
  expandedTicketId,
  onFilterChange,
  onToggleTicket,
  onAddTicketComment,
  onUpdateTicketStatus
}: {
  data: PropertyDetailData;
  role: "owner" | "manager";
  filter: MaintenanceFilter;
  expandedTicketId: string | null;
  onFilterChange: (filter: MaintenanceFilter) => void;
  onToggleTicket: (ticketId: string) => void;
  onAddTicketComment: StatefulAction;
  onUpdateTicketStatus: StatefulAction;
}) {
  const dashboardHref = role === "owner" ? "/owner" : "/manager";
  const visibleTickets = data.maintenance.filter((ticket) => {
    if (filter === "all") return true;
    if (filter === "active") {
      return ticket.status === "open" || ticket.status === "in_progress";
    }
    return ticket.status === "resolved" || ticket.status === "closed";
  });

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-xl font-semibold">Maintenance</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              href={`${dashboardHref}?section=maintenance&property=${encodeURIComponent(data.property.id)}`}
              title="Open the maintenance workflow for this property."
            >
              Open ticket
            </Link>
          </Button>
          <FilterButton
            active={filter === "active"}
            label="Active maintenance"
            title="Show open and in-progress tickets."
            onClick={() => onFilterChange("active")}
          />
          <FilterButton
            active={filter === "completed"}
            label="Completed maintenance"
            title="Show resolved and closed tickets."
            onClick={() => onFilterChange("completed")}
          />
          <FilterButton
            active={filter === "all"}
            label="All"
            title="Show every ticket for this property."
            onClick={() => onFilterChange("all")}
          />
        </div>
      </CardHeader>
      <CardContent>
        {visibleTickets.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No maintenance tickets"
            description="Tickets for this property will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Title</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Last updated</th>
                </tr>
              </thead>
              {visibleTickets.map((ticket) => {
                const isExpanded = expandedTicketId === ticket.id;

                return (
                  <tbody key={ticket.id}>
                    <tr className="border-b border-border/60 align-top hover:bg-muted/20">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => onToggleTicket(ticket.id)}
                          title={
                            isExpanded
                              ? "Hide maintenance ticket details."
                              : "Show maintenance ticket details."
                          }
                        >
                          <p className="font-medium text-foreground">{ticket.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ticket.description}
                          </p>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {ticket.unitNumber ?? "Common area"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={statusBadgeClasses(ticket.status)}>
                          {labelize(ticket.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {labelize(ticket.priority)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDate(ticket.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatDate(lastUpdatedLabel(ticket))}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-border/60">
                        <td colSpan={6} className="px-3 py-4">
                          <div className="space-y-4 rounded-2xl border border-border/60 bg-card/70 p-4">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                              <TicketStatusControl
                                ticketId={ticket.id}
                                currentStatus={ticket.status}
                                onUpdateStatus={onUpdateTicketStatus}
                              />
                              <div className="text-sm text-muted-foreground">
                                <p>Vendor: {ticket.vendorName ?? "Unassigned"}</p>
                                <p>
                                  Photos: {pluralize(ticket.photoCount, "photo")}
                                </p>
                              </div>
                            </div>
                            <MaintenanceTracker
                              currentStatus={ticket.status}
                              timeline={ticket.timeline}
                              ticketCreatedAt={ticket.createdAt}
                            />
                            <MaintenanceCommentThread
                              ticketId={ticket.id}
                              comments={ticket.comments}
                              onAddComment={onAddTicketComment}
                              canAddInternal
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PropertyDetailDocumentsPanel({
  data,
  role
}: {
  data: PropertyDetailData;
  role: "owner" | "manager";
}) {
  const dashboardHref = role === "owner" ? "/owner" : "/manager";
  const tenantVisible = data.documents.files.filter((file) => file.visibility === "all");
  const restricted = data.documents.files.filter(
    (file) => file.visibility === "owner_manager"
  );
  const sections: Array<{
    title: string;
    files: PropertyDetailData["documents"]["files"];
  }> = [
    { title: "Tenant-visible documents", files: tenantVisible },
    { title: "Owner & Manager only", files: restricted }
  ];

  return (
    <div className="space-y-4">
      {data.documents.propertyFilesWarning ? (
        <FeatureWarning
          title="Documents unavailable"
          message={data.documents.propertyFilesWarning}
        />
      ) : null}
      <Card className="border border-border/60 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-xl font-semibold">Documents</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link
              href={`${dashboardHref}?section=documents&property=${encodeURIComponent(data.property.id)}`}
              title="Open the document upload workflow for this property."
            >
              Upload document
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {sections.map(({ title, files }) => (
            <div key={title} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-foreground">{title}</p>
                <Badge variant="outline">{files.length}</Badge>
              </div>
              {files.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
                  No documents in this section yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{file.fileName}</p>
                        <p className="text-sm text-muted-foreground">
                          {documentCategoryLabel(file.category)} • Uploaded{" "}
                          {formatDate(file.createdAt)} by {file.uploaderName}
                        </p>
                        {file.description ? (
                          <p className="text-sm text-muted-foreground">
                            {file.description}
                          </p>
                        ) : null}
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/api/assets/property-file/${file.id}`}
                          target="_blank"
                          rel="noreferrer"
                          title={`Download ${file.fileName}.`}
                        >
                          Download
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
