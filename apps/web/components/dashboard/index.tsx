"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { InvitationListItem } from "@/lib/invitations";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { ActionState } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureWarning } from "@/components/shared/feature-warning";
import { SidebarNav, MobileTopBar, type NavItem } from "./sidebar-nav";
import { KpiGrid } from "./kpi-grid";
import { ChargesSection } from "./charges-section";
import { PaymentsSection } from "./payments-section";
import { MaintenanceSection } from "./maintenance-section";
import { InvitationsSection } from "./invitations-section";
import { OperationsSection } from "./operations-section";
import { PortfolioSection } from "./portfolio-section";
import { UnitsSection } from "./units-section";
import { LeasesSection } from "./leases-section";
import { NotificationsSection } from "./notifications-section";
import { DocumentsSection } from "./documents-section";
import { VendorsSection } from "./vendors-section";
import { ExpensesSection } from "./expenses-section";
import { OwnershipSection } from "./ownership-section";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileSignature,
  FileText,
  LayoutDashboard,
  Receipt,
  Settings,
  UserPlus,
  Wrench
} from "lucide-react";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

interface DashboardProps {
  data: DashboardData;
  portfolio?: PortfolioData;
  tickets?: MaintenanceTicket[];
  invitations?: InvitationListItem[];
  notifications?: NotificationDTO[];
  documents?: OwnerDocumentsData;
  vendors?: VendorDTO[];
  expensesData?: ExpenseDashboardData;
  capabilities?: FeatureCapabilitiesDTO;
  ownershipAccounts?: OwnershipAccountDTO[];
  generatedMessage?: string | null;
  initialSectionId?: string | null;
  userEmail: string;
  showTesterLink?: boolean;
  onGenerateChargesHref?: string;
  onSignOut: FormAction;
  onCreateProperty: StatefulAction;
  onCreateUnit: StatefulAction;
  onCreateLease: StatefulAction;
  onUpdateProperty?: StatefulAction;
  onDeleteProperty?: StatefulAction;
  onUpdateUnit?: StatefulAction;
  onDeleteUnit?: StatefulAction;
  onUpdateLease?: StatefulAction;
  onDeleteLease?: StatefulAction;
  onPayCharge: FormAction;
  onUpdateTicketStatus?: StatefulAction;
  onInviteTenant?: StatefulAction;
  onInviteManager?: StatefulAction;
  onInviteOwner?: StatefulAction;
  onResendInvite?: StatefulAction;
  onMarkNotificationRead?: StatefulAction;
  onCreateDocumentTemplate?: StatefulAction;
  onDeleteDocumentTemplate?: StatefulAction;
  onCreateDocumentPacket?: StatefulAction;
  onSendDocumentPacket?: StatefulAction;
  onUploadPropertyFile?: StatefulAction;
  onDeletePropertyFile?: StatefulAction;
  onUpdateFileVisibility?: StatefulAction;
  onCreateVendor?: StatefulAction;
  onUpdateVendor?: StatefulAction;
  onAssignVendor?: StatefulAction;
  onUploadMaintenancePhoto?: StatefulAction;
  onCreateExpense?: StatefulAction;
  onUpdateExpense?: StatefulAction;
  onDeleteExpense?: StatefulAction;
  onCreateOwnershipAccount?: StatefulAction;
  onLinkPropertyToOwnershipAccount?: StatefulAction;
}

export function Dashboard({
  data,
  portfolio,
  tickets,
  invitations,
  notifications,
  documents,
  vendors,
  expensesData,
  capabilities,
  ownershipAccounts,
  generatedMessage,
  initialSectionId,
  userEmail,
  showTesterLink = false,
  onGenerateChargesHref,
  onSignOut,
  onCreateProperty,
  onCreateUnit,
  onCreateLease,
  onUpdateProperty,
  onDeleteProperty,
  onUpdateUnit,
  onDeleteUnit,
  onUpdateLease,
  onDeleteLease,
  onPayCharge,
  onUpdateTicketStatus,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onMarkNotificationRead,
  onCreateDocumentTemplate,
  onDeleteDocumentTemplate,
  onCreateDocumentPacket,
  onSendDocumentPacket,
  onUploadPropertyFile,
  onDeletePropertyFile,
  onUpdateFileVisibility,
  onCreateVendor,
  onUpdateVendor,
  onAssignVendor,
  onUploadMaintenancePhoto,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateOwnershipAccount,
  onLinkPropertyToOwnershipAccount
}: DashboardProps) {
  const safePortfolio: PortfolioData = portfolio ?? {
    properties: [],
    units: [],
    leases: [],
    tenants: [],
  };
  const safeDocuments: OwnerDocumentsData = documents ?? {
    templates: [],
    packets: [],
    propertyFiles: [],
    propertyFilesEnabled: true,
    propertyFilesWarning: null
  };
  const safeNotifications: NotificationDTO[] = notifications ?? [];
  const safeVendors: VendorDTO[] = vendors ?? [];
  const safeExpenses: ExpenseDashboardData = expensesData ?? {
    enabled: true,
    warning: null,
    properties: [],
    expenses: [],
    pnlByProperty: [],
    monthlyByProperty: {},
    categoryByProperty: {}
  };
  const safeOwnershipAccounts: OwnershipAccountDTO[] = ownershipAccounts ?? [];
  const safeCapabilities: FeatureCapabilitiesDTO = capabilities ?? {
    documentsEnabled: true,
    documentAssetAccessEnabled: true,
    notificationsEnabled: true,
    vendorWorkflowEnabled: true,
    photoWorkflowEnabled: true,
    ownershipEnabled: true,
    warnings: {}
  };
  const occupancy =
    data.kpis.totalUnits > 0
      ? Math.round((data.kpis.occupiedUnits / data.kpis.totalUnits) * 100)
      : 0;
  const canManagePortfolio = data.profileRole === "owner" || data.profileRole === "manager";
  const sortedVendors = [...safeVendors].sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return Number(right.preferred) - Number(left.preferred);
    }
    return left.name.localeCompare(right.name);
  });

  const hasNotificationsSection = Boolean(onMarkNotificationRead);
  const hasOwnershipSection = Boolean(onCreateOwnershipAccount && onLinkPropertyToOwnershipAccount);
  const hasInvitationsSection = Boolean(onInviteTenant && onInviteManager && onResendInvite);
  const hasDocumentsSection = Boolean(
    onCreateDocumentTemplate &&
      onDeleteDocumentTemplate &&
      onCreateDocumentPacket &&
      onSendDocumentPacket
  );
  const hasVendorsSection = Boolean(onCreateVendor);
  const hasExpensesSection = Boolean(
    data.profileRole === "owner" && onCreateExpense && onUpdateExpense && onDeleteExpense
  );

  const sectionItems = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [
      {
        id: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        description: "A single summary view of occupancy, risk, and cashflow.",
        clickHint: "view your KPI overview"
      },
      {
        id: "charges",
        label: "Charges",
        icon: Receipt,
        description: "Upcoming and late charges.",
        clickHint: "open billing charges"
      },
      {
        id: "payments",
        label: "Payments",
        icon: CreditCard,
        description: "Recent payment activity.",
        clickHint: "open payment history"
      },
      {
        id: "maintenance",
        label: "Maintenance",
        icon: Wrench,
        description: "Ticket queue and assignment controls.",
        clickHint: "open maintenance tickets"
      }
    ];

    if (hasNotificationsSection) {
      items.push({
        id: "notifications",
        label: "Notifications",
        icon: Bell,
        description: "Unread and historical alerts.",
        clickHint: "open notification center"
      });
    }

    if (hasOwnershipSection) {
      items.push({
        id: "ownership",
        label: "Ownership",
        icon: UserPlus,
        description: "Ownership accounts and co-owner controls.",
        clickHint: "open ownership controls"
      });
    }

    if (hasInvitationsSection) {
      items.push({
        id: "invitations",
        label: "Invitations",
        icon: UserPlus,
        description: "Invite tenants, managers, and owners.",
        clickHint: "open invitation tools"
      });
    }

    if (hasDocumentsSection) {
      items.push({
        id: "documents",
        label: "Documents",
        icon: FileSignature,
        description: "Templates, packets, and property file vault.",
        clickHint: "open document workflows"
      });
    }

    if (hasVendorsSection) {
      items.push({
        id: "vendors",
        label: "Vendors",
        icon: BriefcaseBusiness,
        description: "Preferred vendor records and assignment metadata.",
        clickHint: "open vendor management"
      });
    }

    if (hasExpensesSection) {
      items.push({
        id: "expenses",
        label: "Expenses",
        icon: CreditCard,
        description: "Expense tracking and monthly P&L.",
        clickHint: "open expense tracking"
      });
    }

    items.push(
      {
        id: "operations",
        label: "Operations",
        icon: Settings,
        description: "Create new properties, units, and leases.",
        clickHint: "open operations forms"
      },
      {
        id: "portfolio",
        label: "Portfolio",
        icon: Building2,
        description: "Property list with edit and archive controls.",
        clickHint: "open property portfolio"
      },
      {
        id: "units",
        label: "Units",
        icon: Building2,
        description: "Unit-level configuration and pricing.",
        clickHint: "open unit list"
      },
      {
        id: "leases",
        label: "Leases",
        icon: FileText,
        description: "Lease records, edits, and archive actions.",
        clickHint: "open lease management"
      }
    );

    return items;
  }, [
    hasDocumentsSection,
    hasExpensesSection,
    hasInvitationsSection,
    hasNotificationsSection,
    hasOwnershipSection,
    hasVendorsSection
  ]);

  const getInitialSection = () => {
    if (!initialSectionId) {
      return "overview";
    }
    return sectionItems.some((item) => item.id === initialSectionId)
      ? initialSectionId
      : "overview";
  };

  const [activeSection, setActiveSection] = useState<string>(getInitialSection);

  useEffect(() => {
    if (!initialSectionId) {
      return;
    }
    if (sectionItems.some((item) => item.id === initialSectionId)) {
      setActiveSection(initialSectionId);
    }
  }, [initialSectionId, sectionItems]);

  useEffect(() => {
    if (!sectionItems.some((item) => item.id === activeSection)) {
      setActiveSection(sectionItems[0]?.id ?? "overview");
    }
  }, [activeSection, sectionItems]);

  const activeSectionIndex = sectionItems.findIndex((item) => item.id === activeSection);
  const activeSectionLabel =
    sectionItems.find((item) => item.id === activeSection)?.label ?? "Overview";

  const goToPreviousSection = () => {
    if (activeSectionIndex <= 0) return;
    setActiveSection(sectionItems[activeSectionIndex - 1].id);
  };

  const goToNextSection = () => {
    if (activeSectionIndex < 0 || activeSectionIndex >= sectionItems.length - 1) return;
    setActiveSection(sectionItems[activeSectionIndex + 1].id);
  };

  const renderActiveSection = () => {
    if (activeSection === "overview") {
      return (
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
      );
    }

    if (activeSection === "charges") {
      return (
        <ChargesSection
          charges={data.charges}
          onPayCharge={onPayCharge}
          onGenerateChargesHref={onGenerateChargesHref}
        />
      );
    }

    if (activeSection === "payments") {
      return <PaymentsSection payments={data.recentPayments} />;
    }

    if (activeSection === "maintenance") {
      return (
        <MaintenanceSection
          tickets={tickets ?? []}
          showControls={!!onUpdateTicketStatus}
          onUpdateStatus={onUpdateTicketStatus}
          vendors={sortedVendors}
          onAssignVendor={safeCapabilities.vendorWorkflowEnabled ? onAssignVendor : undefined}
          onUploadPhoto={safeCapabilities.photoWorkflowEnabled ? onUploadMaintenancePhoto : undefined}
          vendorWorkflowEnabled={safeCapabilities.vendorWorkflowEnabled}
          photoWorkflowEnabled={safeCapabilities.photoWorkflowEnabled}
          vendorWorkflowWarning={safeCapabilities.warnings.vendorWorkflow}
          photoWorkflowWarning={safeCapabilities.warnings.photoWorkflow}
        />
      );
    }

    if (activeSection === "notifications" && hasNotificationsSection) {
      return safeCapabilities.notificationsEnabled ? (
        <NotificationsSection
          notifications={safeNotifications}
          onMarkRead={onMarkNotificationRead!}
        />
      ) : (
        <FeatureWarning
          title="Notifications Unavailable"
          message={
            safeCapabilities.warnings.notifications ??
            "Notifications are not ready yet. Complete setup and reload."
          }
        />
      );
    }

    if (activeSection === "ownership" && hasOwnershipSection) {
      return safeCapabilities.ownershipEnabled ? (
        <OwnershipSection
          accounts={safeOwnershipAccounts}
          properties={safePortfolio.properties.map((property) => ({
            id: property.id,
            name: property.name,
            ownerAccountName: property.ownerAccountName
          }))}
          onCreateOwnershipAccount={onCreateOwnershipAccount!}
          onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount!}
        />
      ) : (
        <FeatureWarning
          title="Ownership Accounts Unavailable"
          message={
            safeCapabilities.warnings.ownership ??
            "LLC/shared ownership is not ready yet. Complete Phase 9 setup and reload."
          }
        />
      );
    }

    if (activeSection === "invitations" && hasInvitationsSection) {
      return (
        <InvitationsSection
          ownershipAccounts={safeOwnershipAccounts.map((account) => ({
            id: account.id,
            displayName: account.displayName
          }))}
          properties={safePortfolio.properties}
          invitations={invitations ?? []}
          onInviteTenant={onInviteTenant!}
          onInviteManager={onInviteManager!}
          onInviteOwner={safeCapabilities.ownershipEnabled ? onInviteOwner : undefined}
          onResendInvite={onResendInvite!}
        />
      );
    }

    if (activeSection === "documents" && hasDocumentsSection) {
      return (
        <DocumentsSection
          properties={safePortfolio.properties.map((property) => ({
            id: property.id,
            name: property.name
          }))}
          templates={safeDocuments.templates}
          packets={safeDocuments.packets}
          propertyFiles={safeDocuments.propertyFiles}
          leases={safePortfolio.leases}
          ownershipAccounts={safeOwnershipAccounts}
          onCreateTemplate={onCreateDocumentTemplate!}
          onDeleteTemplate={onDeleteDocumentTemplate!}
          onCreatePacket={onCreateDocumentPacket!}
          onSendPacket={onSendDocumentPacket!}
          onUploadPropertyFile={onUploadPropertyFile}
          onDeletePropertyFile={onDeletePropertyFile}
          onUpdateFileVisibility={onUpdateFileVisibility}
          propertyFilesEnabled={safeDocuments.propertyFilesEnabled}
          propertyFilesWarning={safeDocuments.propertyFilesWarning}
          isFeatureReady={safeCapabilities.documentsEnabled}
          featureWarning={safeCapabilities.warnings.documents}
          assetAccessEnabled={safeCapabilities.documentAssetAccessEnabled}
          assetAccessWarning={
            safeCapabilities.documentsEnabled && !safeCapabilities.documentAssetAccessEnabled
              ? "Document packet records are available, but file storage access is not configured yet."
              : null
          }
        />
      );
    }

    if (activeSection === "vendors" && hasVendorsSection) {
      return safeCapabilities.vendorWorkflowEnabled ? (
        <VendorsSection
          vendors={safeVendors}
          ownershipAccounts={safeOwnershipAccounts}
          onCreateVendor={onCreateVendor!}
          onUpdateVendor={onUpdateVendor}
        />
      ) : (
        <FeatureWarning
          title="Vendors Unavailable"
          message={
            safeCapabilities.warnings.vendorWorkflow ??
            "Vendor workflows are not ready yet. Complete setup and reload."
          }
        />
      );
    }

    if (activeSection === "expenses" && hasExpensesSection) {
      return (
        <ExpensesSection
          data={safeExpenses}
          vendors={safeVendors}
          propertyFiles={safeDocuments.propertyFiles}
          onCreateExpense={onCreateExpense!}
          onUpdateExpense={onUpdateExpense!}
          onDeleteExpense={onDeleteExpense!}
        />
      );
    }

    if (activeSection === "operations") {
      return (
        <OperationsSection
          portfolio={safePortfolio}
          ownershipAccounts={safeOwnershipAccounts}
          onCreateProperty={onCreateProperty}
          onCreateUnit={onCreateUnit}
          onCreateLease={onCreateLease}
        />
      );
    }

    if (activeSection === "portfolio") {
      return (
        <PortfolioSection
          properties={safePortfolio.properties}
          showControls={canManagePortfolio}
          onUpdateProperty={onUpdateProperty}
          onDeleteProperty={onDeleteProperty}
        />
      );
    }

    if (activeSection === "units") {
      return (
        <UnitsSection
          units={safePortfolio.units}
          showControls={canManagePortfolio}
          onUpdateUnit={onUpdateUnit}
          onDeleteUnit={onDeleteUnit}
        />
      );
    }

    if (activeSection === "leases") {
      return (
        <LeasesSection
          leases={safePortfolio.leases}
          showControls={canManagePortfolio}
          onUpdateLease={onUpdateLease}
          onDeleteLease={onDeleteLease}
        />
      );
    }

    return (
      <FeatureWarning
        title="Section Unavailable"
        message="This section is not currently available for your role."
      />
    );
  };

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar userEmail={userEmail} role={data.profileRole} showTesterLink={showTesterLink} onSignOut={onSignOut} />

      <SidebarNav
        userEmail={userEmail}
        occupancy={occupancy}
        activeLeaseCount={data.kpis.activeLeaseCount}
        role={data.profileRole}
        showTesterLink={showTesterLink}
        onSignOut={onSignOut}
        items={sectionItems}
        activeItemId={activeSection}
        onSelectItem={setActiveSection}
      />

      <main className="relative flex-1 lg:ml-[260px]">
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Operations Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge className="self-start border border-indigo-200 bg-indigo-50 text-indigo-700 capitalize">
            {data.profileRole}
          </Badge>
        </div>

        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {generatedMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              {generatedMessage}
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white/80 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Focused View</p>
              <p className="mt-1 inline-flex items-center rounded-md bg-zinc-900 px-2 py-1 text-sm font-semibold text-white">
                Showing section: {activeSectionLabel}
              </p>
              <p className="text-xs text-zinc-500">
                Click any left-side item to switch sections without scrolling through everything.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToPreviousSection}
                disabled={activeSectionIndex <= 0}
                title="Go to the previous section in the sidebar order."
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToNextSection}
                disabled={activeSectionIndex < 0 || activeSectionIndex >= sectionItems.length - 1}
                title="Go to the next section in the sidebar order."
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <section id={activeSection} className="space-y-6">
            {renderActiveSection()}
          </section>
        </div>
      </main>
    </div>
  );
}
