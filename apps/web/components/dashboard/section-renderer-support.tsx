import type { ReactNode } from "react";
import { Building2, MapPin, Wrench } from "lucide-react";
import { formatCurrency, pluralize } from "@/lib/format";
import { KpiGrid } from "./kpi-grid";
import { PropertySelector } from "./property-selector";
import { RentCollectionBar } from "./rent-collection-bar";
import { PortfolioSection } from "./portfolio-section";
import { InvitationsPanel } from "./invitations-panel";
import { SectionErrorBoundary } from "./section-error-boundary";
import type { SectionRendererProps } from "./section-map";

function PropertyScopeControl({ props }: { props: SectionRendererProps }) {
  if (props.data.profileRole !== "owner" || props.availableProperties.length === 0) {
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
  const summary = props.selectedPropertySummary;
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
          <p className="text-sm font-semibold text-foreground">{title}</p>
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
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <PropertyScopeControl props={props} />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </SectionErrorBoundary>
  );
}

export function OverviewSectionContent({
  props,
  revenueTrend,
  occupancyTrend,
  collectionTrend
}: {
  props: SectionRendererProps;
  revenueTrend: "up" | "down" | "flat" | null;
  occupancyTrend: "up" | "down" | "flat" | null;
  collectionTrend: "up" | "down" | "flat" | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <OverviewSummaryStrip props={props} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="space-y-4">
          <KpiGrid
            kpis={props.data.kpis}
            occupancy={props.occupancy}
            netCashFlowCents={props.data.kpis.netCashFlowCents}
            revenueTrend={revenueTrend}
            occupancyTrend={occupancyTrend}
            collectionTrend={collectionTrend}
          />
          <RentCollectionBar
            collectedCents={props.data.kpis.collectedRentCents}
            pendingCents={props.data.kpis.pendingRentCents}
            overdueCents={props.data.kpis.overdueRentCents}
          />
        </div>
      </div>
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
    <div className={showInvitationPanel ? "grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]" : "h-full"}>
      <div className="min-h-0 overflow-hidden">
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
        />
      </div>
      {showInvitationPanel ? (
        <div className="min-h-0 overflow-hidden">
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
