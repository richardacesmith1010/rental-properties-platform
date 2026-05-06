"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Pencil, Wrench } from "lucide-react";
import { EntityEditModal } from "@/components/dashboard/entity-edit-modal";
import { FirstVisitHelp } from "@/components/dashboard/first-visit-help";
import { ManagerDashboard } from "@/components/dashboard/manager-dashboard";
import { Button } from "@/components/ui/button";
import { formatCurrency, pluralize } from "@/lib/format";
import { buildEntityUpdateFormData, buildPropertyEditFields } from "@/lib/entity-edit-fields";
import { PropertySelector } from "./property-selector";
import { PortfolioSection } from "./portfolio-section";
import { InvitationsPanel } from "./invitations-panel";
import { SectionErrorBoundary } from "./section-error-boundary";
import type { SectionRendererProps } from "./section-map";

function getSectionHelpText(sectionId: string, role: string) {
  if (sectionId === "charges" && role !== "tenant") {
    return "Charges are automatically created each month from your leases. You can send reminders, edit, waive, or delete them here.";
  }

  if (sectionId === "maintenance") {
    return role === "tenant"
      ? "When you report a problem, updates from your landlord will show up here."
      : "When your tenant reports a problem, it shows up here with status and photo updates.";
  }

  if (sectionId === "members") {
    return "Everyone you invite here can view and manage this LLC's properties.";
  }

  if (sectionId === "analytics") {
    return "These reports pull from your actual lease, payment, and expense data.";
  }

  return null;
}

function PropertyScopeControl({ props }: { props: SectionRendererProps }) {
  const isOwnerOrManager = props.data.profileRole === "owner" || props.data.profileRole === "manager";

  if (
    !isOwnerOrManager ||
    props.availableProperties.length === 0 ||
    props.activeSection === "members" ||
    props.activeSection === "tenants"
  ) {
    return null;
  }

  return (
    <div className="flex justify-end">
      <PropertySelector
        properties={props.availableProperties.map((property) => ({
          id: property.id,
          name: property.name,
          address: [property.addressLine1, property.city, property.state].filter(Boolean).join(", ")
        }))}
        selectedPropertyId={props.selectedPropertyId}
        onSelect={props.onSelectProperty}
      />
    </div>
  );
}

function OverviewSummaryStrip({ props }: { props: SectionRendererProps }) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const summary = props.selectedPropertySummary;
  const editableProperty = summary
    ? props.filteredPortfolio.properties.find((property) => property.id === summary.property.id) ?? null
    : null;
  const unitCount = summary?.unitCount ?? props.filteredPortfolio.units.length;
  const occupiedUnits =
    summary?.occupiedUnits ?? props.filteredPortfolio.units.filter((unit) => unit.occupied).length;
  const openTickets =
    summary?.openTickets ??
    props.filteredTickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress")
      .length;
  const occupancy = unitCount > 0 ? Math.round((occupiedUnits / unitCount) * 100) : 0;
  const title = summary?.property.name ?? "Portfolio Summary";
  const subtitle =
    summary?.property.address ??
    `${pluralize(props.filteredPortfolio.properties.length, "property")} in view`;

  const items = [
    { label: "Units", value: pluralize(unitCount, "unit"), icon: Building2 },
    { label: "Occupancy", value: `${occupancy}% occupied` },
    { label: "Monthly rent", value: formatCurrency(summary?.monthlyRentCents ?? props.data.kpis.monthlyGrossRentCents) },
    { label: "Open tickets", value: pluralize(openTickets, "ticket"), icon: Wrench }
  ];

  return (
    <div className="rounded-2xl border border-border bg-card/90 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {props.canManagePortfolio && props.onUpdateProperty && editableProperty ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-md"
                onClick={() => setIsEditOpen(true)}
                title={`Edit ${editableProperty.name}`}
                aria-label={`Edit ${editableProperty.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {summary?.property.address ? <MapPin className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                <span className="font-medium">{label}</span>
              </span>
              <span className="ml-2 font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </div>
      {editableProperty && props.onUpdateProperty ? (
        <EntityEditModal
          open={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit Property"
          entityType="property"
          fields={buildPropertyEditFields(editableProperty)}
          onSave={async (updates) => {
            const result = await props.onUpdateProperty!(
              null,
              buildEntityUpdateFormData({ propertyId: editableProperty.id }, updates)
            );
            if (result?.success) {
              router.refresh();
              return { message: result.message ?? "Property updated." };
            }
            return { error: result?.error ?? "Unable to update this property right now." };
          }}
        />
      ) : null}
    </div>
  );
}

export function SectionFrame({
  props,
  sectionName,
  children
}: {
  props: SectionRendererProps;
  sectionName: string;
  children: ReactNode;
}) {
  return (
    <SectionErrorBoundary sectionName={sectionName}>
      <div className="flex min-h-full flex-col gap-4">
        <PropertyScopeControl props={props} />
        {getSectionHelpText(props.activeSection, props.data.profileRole) ? (
          <FirstVisitHelp sectionId={`${props.data.profileRole}-${props.activeSection}`}>
            {getSectionHelpText(props.activeSection, props.data.profileRole)}
          </FirstVisitHelp>
        ) : null}
        <div>{children}</div>
      </div>
    </SectionErrorBoundary>
  );
}

export function OverviewSectionContent({
  props
}: {
  props: SectionRendererProps;
}) {
  if (props.data.profileRole === "manager") {
    return (
      <ManagerDashboard
        tickets={props.filteredTickets}
        charges={props.data.charges}
        notifications={props.safeNotifications}
        onOpenSection={props.goToSectionIfVisible}
        onUpdateTicketStatus={props.onUpdateTicketStatus}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <OverviewSummaryStrip props={props} />
      <PortfolioSection
        properties={props.filteredPortfolio.properties}
        previewCount={props.isOwnerDailyOpsCarousel ? 3 : undefined}
        onSelectProperty={props.onSelectProperty}
        onGoToOperations={() => props.goToSectionIfVisible("operations")}
        getPropertyDetailHref={(propertyId) =>
          props.data.profileRole === "owner"
            ? `/owner/properties/${propertyId}`
            : `/manager/properties/${propertyId}`
        }
      />
    </div>
  );
}

export function PortfolioSectionContent({ props }: { props: SectionRendererProps }) {
  const tenantInvitationCount =
    props.invitations?.filter((invitation) => invitation.role === "tenant").length ?? 0;
  const showInvitationPanel =
    props.data.profileRole === "owner" &&
    Boolean(props.onResendInvite) &&
    Boolean(props.onRevokeInvite) &&
    tenantInvitationCount > 0;

  return (
    <div className={showInvitationPanel ? "grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]" : ""}>
      <div>
        <PortfolioSection
          properties={props.filteredPortfolio.properties}
          showControls={props.canManagePortfolio}
          onRenameProperty={props.data.profileRole === "owner" ? props.onRenameProperty : undefined}
          onUpdateProperty={props.onUpdateProperty}
          onDeleteProperty={props.onDeleteProperty}
          onUpdateManagementFee={
            props.data.profileRole === "owner" ? props.onUpdateManagementFee : undefined
          }
          onSelectProperty={(propertyId) => {
            props.onSelectProperty(propertyId);
            props.goToSectionIfVisible("overview");
          }}
          onGoToOperations={() => props.goToSectionIfVisible("operations")}
          previewCount={props.isOwnerDailyOpsCarousel ? 4 : undefined}
          getPropertyDetailHref={(propertyId) =>
            props.data.profileRole === "owner"
              ? `/owner/properties/${propertyId}`
              : `/manager/properties/${propertyId}`
          }
        />
      </div>
      {showInvitationPanel ? (
        <div>
          <InvitationsPanel
            invitations={props.invitations ?? []}
            onResendInvite={props.onResendInvite!}
            onRevokeInvite={props.onRevokeInvite!}
            onOpenInviteWizard={props.openTenantInviteWizard}
          />
        </div>
      ) : null}
    </div>
  );
}
