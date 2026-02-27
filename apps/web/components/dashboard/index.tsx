import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { SidebarNav, MobileTopBar } from "./sidebar-nav";
import { KpiGrid } from "./kpi-grid";
import { ChargesSection } from "./charges-section";
import { PaymentsSection } from "./payments-section";
import { MaintenanceSection } from "./maintenance-section";
import { OperationsSection } from "./operations-section";
import { PortfolioSection } from "./portfolio-section";
import { LeasesSection } from "./leases-section";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DashboardProps {
  data: DashboardData;
  portfolio?: PortfolioData;
  tickets?: MaintenanceTicket[];
  userEmail: string;
  onSignOut: FormAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onPayCharge: FormAction;
  onUpdateTicketStatus?: StatefulAction;
}

export function Dashboard({
  data,
  portfolio,
  tickets,
  userEmail,
  onSignOut,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onPayCharge,
  onUpdateTicketStatus,
}: DashboardProps) {
  const safePortfolio: PortfolioData = portfolio ?? {
    properties: [],
    units: [],
    leases: [],
    tenants: [],
  };
  const occupancy =
    data.kpis.totalUnits > 0
      ? Math.round((data.kpis.occupiedUnits / data.kpis.totalUnits) * 100)
      : 0;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar */}
      <MobileTopBar userEmail={userEmail} role={data.profileRole} onSignOut={onSignOut} />

      {/* Desktop sidebar */}
      <SidebarNav
        userEmail={userEmail}
        occupancy={occupancy}
        activeLeaseCount={data.kpis.activeLeaseCount}
        role={data.profileRole}
        onSignOut={onSignOut}
      />

      {/* Main content */}
      <main className="flex-1 lg:ml-[260px]">
        {/* Header */}
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge className="self-start capitalize">{data.profileRole}</Badge>
        </div>

        {/* Content sections */}
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          <KpiGrid
            monthlyGrossRentCents={data.kpis.monthlyGrossRentCents}
            occupancy={occupancy}
            occupiedUnits={data.kpis.occupiedUnits}
            totalUnits={data.kpis.totalUnits}
            activeLeaseCount={data.kpis.activeLeaseCount}
            openMaintenanceCount={data.kpis.openMaintenanceCount}
            highPriorityMaintenanceCount={data.kpis.highPriorityMaintenanceCount}
            lateRentCents={data.kpis.lateRentCents}
            lateAccountCount={data.kpis.lateAccountCount}
          />

          <ChargesSection charges={data.charges} onPayCharge={onPayCharge} />

          <PaymentsSection payments={data.recentPayments} />

          <MaintenanceSection
            tickets={tickets ?? []}
            showControls={!!onUpdateTicketStatus}
            onUpdateStatus={onUpdateTicketStatus}
          />

          <OperationsSection
            portfolio={safePortfolio}
            onCreateProperty={onCreateProperty}
            onCreateUnit={onCreateUnit}
            onCreateLease={onCreateLease}
          />

          <PortfolioSection properties={safePortfolio.properties} />

          <LeasesSection leases={safePortfolio.leases} />
        </div>
      </main>
    </div>
  );
}
