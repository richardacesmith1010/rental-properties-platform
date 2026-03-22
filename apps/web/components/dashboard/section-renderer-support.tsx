import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/format";
import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";
import { KpiGrid } from "./kpi-grid";
import { PropertySelector } from "./property-selector";
import { PropertySummaryCard } from "./property-summary-card";
import { RentCollectionBar } from "./rent-collection-bar";
import { PortfolioSection } from "./portfolio-section";
import { InvitationsPanel } from "./invitations-panel";
import { SectionErrorBoundary } from "./section-error-boundary";
import type { SectionRendererProps } from "./section-map";

export function CompactAnalyticsPreview({
  collectionRate,
  avgDaysToPayment,
  totalIncomeCentsYtd,
  netIncomeCentsYtd
}: SectionRendererProps["safeAnalytics"]["summaryKpis"]) {
  const items = [
    { label: "Collection rate", value: `${Math.round(collectionRate)}%` },
    { label: "Avg days to pay", value: `${avgDaysToPayment.toFixed(1)}d` },
    { label: "Income YTD", value: formatCurrency(totalIncomeCentsYtd) },
    { label: "Net income YTD", value: formatCurrency(netIncomeCentsYtd) }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-2 text-xl font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function buildBreadcrumbItems(props: SectionRendererProps): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [
    {
      label: "Dashboard",
      onClick:
        props.activeSection !== "overview" || props.selectedPropertyId
          ? () => {
              props.onSelectProperty(null);
              props.goToSectionIfVisible("overview");
            }
          : undefined
    }
  ];

  if (props.activeSection !== "overview") {
    items.push(
      props.selectedProperty
        ? {
            label: props.activeSectionLabel,
            onClick: () => {
              props.onSelectProperty(null);
              props.goToSectionIfVisible(props.activeSection);
            }
          }
        : { label: props.activeSectionLabel }
    );
  }

  if (props.selectedProperty) {
    items.push({ label: props.selectedProperty.name });
  }

  return items;
}

function OwnerSectionChrome({ props }: { props: SectionRendererProps }) {
  if (props.data.profileRole !== "owner" || props.availableProperties.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Breadcrumbs items={buildBreadcrumbItems(props)} />
        <PropertySelector
          properties={props.availableProperties.map((property) => ({
            id: property.id,
            name: property.name,
            address: [property.addressLine1, property.city, property.state]
              .filter(Boolean)
              .join(", ")
          }))}
          selectedPropertyId={props.selectedPropertyId}
          onSelect={props.onSelectProperty}
        />
      </div>
      {props.activeSection === "overview" && props.selectedPropertySummary ? (
        <PropertySummaryCard
          property={props.selectedPropertySummary.property}
          unitCount={props.selectedPropertySummary.unitCount}
          occupiedUnits={props.selectedPropertySummary.occupiedUnits}
          monthlyRentCents={props.selectedPropertySummary.monthlyRentCents}
          openTickets={props.selectedPropertySummary.openTickets}
          onViewDetails={() => props.openSection("portfolio")}
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
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
        <OwnerSectionChrome props={props} />
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
  const snapshotCard = (
    <div
      role="status"
      aria-label={`Snapshot: ${props.occupancy}% occupied. ${props.data.kpis.activeLeaseCount} active lease${props.data.kpis.activeLeaseCount === 1 ? "" : "s"}.`}
      className="rounded-2xl border border-border/50 bg-card p-4 shadow-sm"
    >
      <p aria-hidden="true" className="text-xs uppercase tracking-wide text-muted-foreground">
        Snapshot
      </p>
      <p aria-live="polite" aria-atomic="true" className="mt-1 text-xl font-bold text-foreground">
        {props.occupancy}% occupied
      </p>
      <p aria-hidden="true" className="text-sm text-muted-foreground">
        {props.data.kpis.activeLeaseCount} active lease
        {props.data.kpis.activeLeaseCount === 1 ? "" : "s"}
      </p>
    </div>
  );

  const collectionBar = (
    <RentCollectionBar
      collectedCents={props.data.kpis.collectedRentCents}
      pendingCents={props.data.kpis.pendingRentCents}
      overdueCents={props.data.kpis.overdueRentCents}
    />
  );

  const overviewGrid = (
    <KpiGrid
      kpis={props.data.kpis}
      occupancy={props.occupancy}
      netCashFlowCents={props.data.kpis.netCashFlowCents}
      revenueTrend={revenueTrend}
      occupancyTrend={occupancyTrend}
      collectionTrend={collectionTrend}
    />
  );

  if (props.isOwnerDailyOpsCarousel) {
    return (
      <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-4">
          {snapshotCard}
          {collectionBar}
        </div>
        <div className="min-h-0 overflow-hidden">{overviewGrid}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      {snapshotCard}
      {overviewGrid}
      {collectionBar}
    </div>
  );
}

export function PortfolioSectionContent({ props }: { props: SectionRendererProps }) {
  return (
    <div className={props.data.profileRole === "owner" ? "grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]" : "h-full"}>
      <div className="min-h-0 overflow-hidden">
        <PortfolioSection
          properties={props.filteredPortfolio.properties}
          showControls={props.canManagePortfolio}
          onRenameProperty={
            props.data.profileRole === "owner" ? props.onRenameProperty : undefined
          }
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
      {props.data.profileRole === "owner" && props.onResendInvite && props.onRevokeInvite ? (
        <div className="min-h-0 overflow-hidden">
          <InvitationsPanel
            invitations={props.invitations ?? []}
            onResendInvite={props.onResendInvite}
            onRevokeInvite={props.onRevokeInvite}
            onOpenInviteWizard={props.openTenantInviteWizard}
          />
        </div>
      ) : null}
    </div>
  );
}
