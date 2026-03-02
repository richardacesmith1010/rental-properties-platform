"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { LeasingHubSection } from "./leasing-hub-section";
import { InboxSection } from "./inbox-section";
import { AutomationTemplatesSection } from "./automation-templates-section";
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
  ShieldCheck,
  UserPlus,
  Wrench
} from "lucide-react";

type FormAction = (formData: FormData) => Promise<void>;
type StatefulAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type OwnerWorkflowMode =
  | "daily_ops"
  | "new_property"
  | "new_tenant"
  | "new_manager"
  | "records";
type ManagerWorkflowMode =
  | "daily_ops"
  | "new_property"
  | "new_tenant"
  | "vendor_ops";

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
  initialOwnerWorkflowMode?: OwnerWorkflowMode;
  initialManagerWorkflowMode?: ManagerWorkflowMode;
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

const ownerWorkflowModeMeta: Record<
  OwnerWorkflowMode,
  { label: string; description: string; sections: string[] }
> = {
  daily_ops: {
    label: "Daily Operations Mode",
    description: "Daily owner runbook: revenue risk, payments, maintenance, and alerts.",
    sections: ["overview", "charges", "payments", "maintenance", "inbox", "automations", "expenses"]
  },
  new_property: {
    label: "New Property Mode",
    description: "Step-by-step flow to add a property, add units, and finalize lease setup.",
    sections: ["overview", "operations", "portfolio", "units", "leases", "charges"]
  },
  new_tenant: {
    label: "New Tenant Mode",
    description: "Focused flow for invitation, lease setup, signatures, and first billing visibility.",
    sections: ["overview", "leasing", "invitations", "operations", "leases", "documents", "charges", "inbox"]
  },
  new_manager: {
    label: "New Manager Mode",
    description: "Focused flow to onboard a manager and verify maintenance/vendor operations.",
    sections: ["overview", "invitations", "vendors", "maintenance", "inbox"]
  },
  records: {
    label: "Records & Compliance Mode",
    description: "Document vault, ownership accounts, and property records.",
    sections: ["overview", "documents", "ownership", "portfolio", "units", "leases"]
  }
};

const managerWorkflowModeMeta: Record<
  ManagerWorkflowMode,
  { label: string; description: string; sections: string[] }
> = {
  daily_ops: {
    label: "Daily Operations Mode",
    description: "Daily manager runbook: maintenance queue, charges, and alerts.",
    sections: ["overview", "maintenance", "charges", "inbox", "automations", "payments"]
  },
  new_property: {
    label: "New Property Mode",
    description: "Onboard a property with units and leases in order.",
    sections: ["overview", "operations", "portfolio", "units", "leases", "charges"]
  },
  new_tenant: {
    label: "New Tenant Mode",
    description: "Invite tenant, activate lease, and verify billing readiness.",
    sections: ["overview", "leasing", "invitations", "operations", "leases", "documents", "charges", "inbox"]
  },
  vendor_ops: {
    label: "Vendor Operations Mode",
    description: "Manage vendors and maintenance execution with minimal distractions.",
    sections: ["overview", "vendors", "maintenance", "inbox", "automations"]
  }
};

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
  initialOwnerWorkflowMode,
  initialManagerWorkflowMode,
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
    leasingPipelineEnabled: true,
    inboxThreadsEnabled: true,
    automationsEnabled: true,
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
  const hasInboxSection = Boolean(onMarkNotificationRead);
  const hasAutomationsSection = Boolean(data.profileRole === "owner" || data.profileRole === "manager");
  const hasOwnershipSection = Boolean(onCreateOwnershipAccount && onLinkPropertyToOwnershipAccount);
  const hasInvitationsSection = Boolean(onInviteTenant && onInviteManager && onResendInvite);
  const hasLeasingSection = Boolean(canManagePortfolio && hasInvitationsSection);
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
  const isOwnerRole = data.profileRole === "owner";
  const isManagerRole = data.profileRole === "manager";
  const [ownerWorkflowMode, setOwnerWorkflowMode] = useState<OwnerWorkflowMode>(
    initialOwnerWorkflowMode ?? "daily_ops"
  );
  const [managerWorkflowMode, setManagerWorkflowMode] = useState<ManagerWorkflowMode>(
    initialManagerWorkflowMode ?? "daily_ops"
  );

  const allSectionItems = useMemo<NavItem[]>(() => {
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
      },
      
    ];

    if (hasLeasingSection) {
      items.push({
        id: "leasing",
        label: "Leasing Hub",
        icon: Building2,
        description: "Step-by-step leasing progression from invitation to billing live.",
        clickHint: "open leasing workflow hub"
      });
    }

    if (hasInboxSection) {
      items.push({
        id: "inbox",
        label: "Inbox",
        icon: Bell,
        description: "Central event timeline for operational communication.",
        clickHint: "open domus inbox"
      });
    }

    if (hasAutomationsSection) {
      items.push({
        id: "automations",
        label: "Domus Flows",
        icon: Settings,
        description: "Automation templates for recurring workflows.",
        clickHint: "open automation templates"
      });
    }

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
    hasAutomationsSection,
    hasDocumentsSection,
    hasExpensesSection,
    hasInboxSection,
    hasInvitationsSection,
    hasLeasingSection,
    hasNotificationsSection,
    hasOwnershipSection,
    hasVendorsSection
  ]);

  const ownerModeNavItems = useMemo<NavItem[]>(() => {
    if (!isOwnerRole) {
      return [];
    }

    return [
      {
        id: "owner:daily_ops",
        label: "Daily Ops",
        icon: LayoutDashboard,
        description: "Revenue, maintenance, and alerts for daily management.",
        clickHint: "switch to owner daily operations mode"
      },
      {
        id: "owner:new_property",
        label: "New Property",
        icon: Building2,
        description: "Property to unit to lease onboarding flow.",
        clickHint: "switch to owner new property mode"
      },
      {
        id: "owner:new_tenant",
        label: "New Tenant",
        icon: UserPlus,
        description: "Invite tenant, create lease, verify billing.",
        clickHint: "switch to owner new tenant mode"
      },
      {
        id: "owner:new_manager",
        label: "New Manager",
        icon: BriefcaseBusiness,
        description: "Assign manager to property and verify vendor flow.",
        clickHint: "switch to owner new manager mode"
      },
      {
        id: "owner:records",
        label: "Records",
        icon: ShieldCheck,
        description: "Documents, ownership, and portfolio records.",
        clickHint: "switch to owner records mode"
      }
    ];
  }, [isOwnerRole]);

  const managerModeNavItems = useMemo<NavItem[]>(() => {
    if (!isManagerRole) {
      return [];
    }

    return [
      {
        id: "manager:daily_ops",
        label: "Daily Ops",
        icon: LayoutDashboard,
        description: "Daily queue for maintenance, charges, and alerts.",
        clickHint: "switch to manager daily operations mode"
      },
      {
        id: "manager:new_property",
        label: "New Property",
        icon: Building2,
        description: "Onboard property, units, and initial lease setup.",
        clickHint: "switch to manager new property mode"
      },
      {
        id: "manager:new_tenant",
        label: "New Tenant",
        icon: UserPlus,
        description: "Tenant invitation and lease activation flow.",
        clickHint: "switch to manager new tenant mode"
      },
      {
        id: "manager:vendor_ops",
        label: "Vendor Ops",
        icon: BriefcaseBusiness,
        description: "Vendor-first maintenance execution flow.",
        clickHint: "switch to manager vendor operations mode"
      }
    ];
  }, [isManagerRole]);

  const activeWorkflowMeta = useMemo(() => {
    if (isOwnerRole) {
      return ownerWorkflowModeMeta[ownerWorkflowMode];
    }
    if (isManagerRole) {
      return managerWorkflowModeMeta[managerWorkflowMode];
    }
    return null;
  }, [isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const sectionItems = useMemo<NavItem[]>(() => {
    if (!activeWorkflowMeta) {
      return allSectionItems;
    }
    const allowedSections = new Set(activeWorkflowMeta.sections);
    const filtered = allSectionItems.filter((item) => allowedSections.has(item.id));
    return filtered.length > 0 ? filtered : allSectionItems;
  }, [activeWorkflowMeta, allSectionItems]);

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

  const goToSectionIfVisible = useCallback(
    (sectionId: string) => {
      if (sectionItems.some((item) => item.id === sectionId)) {
        setActiveSection(sectionId);
      }
    },
    [sectionItems]
  );

  const ownerWorkflowSteps = useMemo(() => {
    if (!isOwnerRole) {
      return [];
    }

    if (ownerWorkflowMode === "new_property") {
      return [
        {
          label: "Create property record",
          done: safePortfolio.properties.length > 0
        },
        {
          label: "Add at least one unit",
          done: safePortfolio.units.length > 0
        },
        {
          label: "Finalize first lease",
          done: safePortfolio.leases.length > 0
        }
      ];
    }

    if (ownerWorkflowMode === "new_tenant") {
      const tenantInvites =
        (invitations ?? []).filter((invitation) => invitation.role === "tenant").length > 0;
      const packetSent =
        safeDocuments.packets.filter(
          (packet) => packet.status === "sent" || packet.status === "signed"
        ).length > 0;

      return [
        {
          label: "Send tenant invitation",
          done: tenantInvites
        },
        {
          label: "Create active lease",
          done: safePortfolio.leases.length > 0
        },
        {
          label: "Send lease document packet",
          done: packetSent
        },
        {
          label: "Verify first charge",
          done: data.charges.length > 0
        }
      ];
    }

    if (ownerWorkflowMode === "new_manager") {
      const managerInvites =
        (invitations ?? []).filter((invitation) => invitation.role === "manager").length > 0;

      return [
        {
          label: "Send manager invitation",
          done: managerInvites
        },
        {
          label: "Set up preferred vendor",
          done: safeVendors.length > 0
        },
        {
          label: "Review maintenance queue",
          done: (tickets ?? []).length > 0
        }
      ];
    }

    return [];
  }, [
    data.charges.length,
    invitations,
    isOwnerRole,
    ownerWorkflowMode,
    safeDocuments.packets,
    safePortfolio.leases.length,
    safePortfolio.properties.length,
    safePortfolio.units.length,
    safeVendors.length,
    tickets
  ]);

  const handleOwnerWorkflowModeChange = (mode: OwnerWorkflowMode) => {
    if (!isOwnerRole) return;
    setOwnerWorkflowMode(mode);
    const nextSection = ownerWorkflowModeMeta[mode].sections[0];
    if (nextSection) {
      setActiveSection(nextSection);
    }
  };

  const handleManagerWorkflowModeChange = (mode: ManagerWorkflowMode) => {
    if (!isManagerRole) return;
    setManagerWorkflowMode(mode);
    const nextSection = managerWorkflowModeMeta[mode].sections[0];
    if (nextSection) {
      setActiveSection(nextSection);
    }
  };

  const handlePropertyCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("portfolio");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleUnitCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("units");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleLeaseCreated = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_property") ||
      (isManagerRole && managerWorkflowMode === "new_property")
    ) {
      goToSectionIfVisible("leases");
      return;
    }
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("documents");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleTenantInviteSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_tenant") ||
      (isManagerRole && managerWorkflowMode === "new_tenant")
    ) {
      goToSectionIfVisible("leasing");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const handleManagerInviteSuccess = useCallback(() => {
    if (isOwnerRole && ownerWorkflowMode === "new_manager") {
      goToSectionIfVisible("vendors");
    }
  }, [goToSectionIfVisible, isOwnerRole, ownerWorkflowMode]);

  const handleOwnerInviteSuccess = useCallback(() => {
    if (isOwnerRole) {
      goToSectionIfVisible("ownership");
    }
  }, [goToSectionIfVisible, isOwnerRole]);

  const handleVendorCreatedSuccess = useCallback(() => {
    if (
      (isOwnerRole && ownerWorkflowMode === "new_manager") ||
      (isManagerRole && managerWorkflowMode === "vendor_ops")
    ) {
      goToSectionIfVisible("maintenance");
    }
  }, [goToSectionIfVisible, isManagerRole, isOwnerRole, managerWorkflowMode, ownerWorkflowMode]);

  const renderActiveSection = () => {
    if (activeSection === "overview") {
      return (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Snapshot</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{occupancy}% occupied</p>
            <p className="text-sm text-zinc-600">
              {data.kpis.activeLeaseCount} active lease{data.kpis.activeLeaseCount === 1 ? "" : "s"}
            </p>
          </div>
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
        </>
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

    if (activeSection === "leasing" && hasLeasingSection) {
      return (
        <LeasingHubSection
          portfolio={safePortfolio}
          invitations={invitations ?? []}
          documents={safeDocuments}
          chargeCount={data.charges.length}
          pipelineReady={safeCapabilities.leasingPipelineEnabled}
          pipelineWarning={safeCapabilities.warnings.leasingPipeline}
          onOpenSection={goToSectionIfVisible}
        />
      );
    }

    if (activeSection === "inbox" && hasInboxSection) {
      return (
        <InboxSection
          notifications={safeNotifications}
          onMarkRead={onMarkNotificationRead!}
          threadsReady={safeCapabilities.inboxThreadsEnabled}
          threadsWarning={safeCapabilities.warnings.inboxThreads}
          onOpenSection={goToSectionIfVisible}
        />
      );
    }

    if (activeSection === "automations" && hasAutomationsSection) {
      return (
        <AutomationTemplatesSection
          role={data.profileRole === "manager" ? "manager" : "owner"}
          runtimeReady={safeCapabilities.automationsEnabled}
          runtimeWarning={safeCapabilities.warnings.automations}
          onOpenSection={goToSectionIfVisible}
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
          onTenantInviteSuccess={handleTenantInviteSuccess}
          onManagerInviteSuccess={handleManagerInviteSuccess}
          onOwnerInviteSuccess={handleOwnerInviteSuccess}
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
          onCreateVendorSuccess={handleVendorCreatedSuccess}
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
          onPropertyCreated={handlePropertyCreated}
          onUnitCreated={handleUnitCreated}
          onLeaseCreated={handleLeaseCreated}
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

  const sidebarItems = isOwnerRole
    ? ownerModeNavItems
    : isManagerRole
      ? managerModeNavItems
      : sectionItems;

  const sidebarActiveItemId = isOwnerRole
    ? `owner:${ownerWorkflowMode}`
    : isManagerRole
      ? `manager:${managerWorkflowMode}`
      : activeSection;

  const handleSidebarSelect = (itemId: string) => {
    if (isOwnerRole && itemId.startsWith("owner:")) {
      const mode = itemId.replace("owner:", "") as OwnerWorkflowMode;
      handleOwnerWorkflowModeChange(mode);
      return;
    }
    if (isManagerRole && itemId.startsWith("manager:")) {
      const mode = itemId.replace("manager:", "") as ManagerWorkflowMode;
      handleManagerWorkflowModeChange(mode);
      return;
    }
    setActiveSection(itemId);
  };

  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar userEmail={userEmail} role={data.profileRole} showTesterLink={showTesterLink} onSignOut={onSignOut} />

      <SidebarNav
        userEmail={userEmail}
        role={data.profileRole}
        showTesterLink={showTesterLink}
        onSignOut={onSignOut}
        items={sidebarItems}
        activeItemId={sidebarActiveItemId}
        onSelectItem={handleSidebarSelect}
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

          {(isOwnerRole || isManagerRole) && (
            <div className="rounded-xl border border-zinc-200/80 bg-white/90 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Workflow Mode</p>
                  <p className="mt-1 text-base font-semibold text-zinc-900">
                    {activeWorkflowMeta?.label ?? "Focused Mode"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {activeWorkflowMeta?.description ?? "Navigation is filtered to the active workflow."}
                  </p>
                </div>
                <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  Use the left sidebar to switch modes.
                </div>
              </div>

              {isOwnerRole && ownerWorkflowSteps.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {ownerWorkflowSteps.map((step) => (
                    <div
                      key={step.label}
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        step.done
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-600"
                      }`}
                    >
                      {step.done ? "Done" : "Pending"}: {step.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white/80 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Focused View</p>
              <p className="mt-1 inline-flex items-center rounded-md bg-zinc-900 px-2 py-1 text-sm font-semibold text-white">
                Showing section: {activeSectionLabel}
              </p>
              <p className="text-xs text-zinc-500">
                {isOwnerRole || isManagerRole
                  ? "Use left-side mode buttons, then move one section at a time with Previous/Next."
                  : "Click any left-side item to switch sections without scrolling through everything."}
                {activeWorkflowMeta ? ` Active mode: ${activeWorkflowMeta.label}.` : ""}
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
