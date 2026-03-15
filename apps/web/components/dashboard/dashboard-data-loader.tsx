"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { formatDate } from "@/lib/format";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { PortfolioData } from "@/lib/portfolio";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import type { MaintenanceTicket } from "@/lib/maintenance";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { DashboardLayoutProps } from "./dashboard-layout";
import {
  buildAllSectionItems,
  getManagerModeNavItems,
  getOwnerModeNavItems,
  managerWorkflowModeMeta,
  ownerWorkflowModeMeta,
  type ManagerWorkflowMode,
  type OwnerWorkflowMode
} from "./dashboard-config";
import type { GlobalSearchItem } from "./global-search";
import { SectionRenderer } from "./section-renderer";
import type { NavItem } from "./sidebar-nav";
import type { DashboardProps } from "./types";

const EMPTY_TICKETS: MaintenanceTicket[] = [];
const EMPTY_AUDIT_LOGS: AuditLogEntry[] = [];
const EMPTY_RENT_INCREASE_HISTORY: RentIncreaseEntry[] = [];

type SectionRendererProps = ComponentProps<typeof SectionRenderer>;
type LayoutProps = Omit<DashboardLayoutProps, "children" | "mainClassName" | "afterMain">;

export function useDashboardData(props: DashboardProps) {
  const resolvedGamification = props.gamification ?? {
    totalXp: 0,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  };
  const safePortfolio: PortfolioData = props.portfolio ?? {
    properties: [],
    units: [],
    leases: [],
    tenants: []
  };
  const safeDocuments: OwnerDocumentsData = props.documents ?? {
    templates: [],
    packets: [],
    propertyFiles: [],
    propertyFilesEnabled: true,
    propertyFilesWarning: null
  };
  const safeTickets = useMemo(() => props.tickets ?? EMPTY_TICKETS, [props.tickets]);
  const safeAuditLogs = useMemo(() => props.auditLogs ?? EMPTY_AUDIT_LOGS, [props.auditLogs]);
  const safeRentIncreaseHistory = useMemo(
    () => props.rentIncreaseHistory ?? EMPTY_RENT_INCREASE_HISTORY,
    [props.rentIncreaseHistory]
  );
  const safeExpenses: ExpenseDashboardData = props.expensesData ?? {
    enabled: true,
    warning: null,
    properties: [],
    expenses: [],
    pnlByProperty: [],
    monthlyByProperty: {},
    categoryByProperty: {}
  };
  const safeAnalytics: AnalyticsDashboardData = props.analyticsData ?? {
    enabled: false,
    rentMetrics: [],
    expenseCategories: [],
    occupancyMetrics: [],
    maintenanceMetrics: [],
    summaryKpis: {
      collectionRate: 0,
      avgDaysToPayment: 0,
      totalIncomeCentsYtd: 0,
      totalExpenseCentsYtd: 0,
      netIncomeCentsYtd: 0,
      maintenanceCostCentsYtd: 0
    }
  };
  const safeCapabilities: FeatureCapabilitiesDTO = props.capabilities ?? {
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
  const safeOwnershipAccounts: OwnershipAccountDTO[] = props.ownershipAccounts ?? [];
  const safeNotifications = props.notifications ?? [];
  const safeInboxThreads = props.inboxThreads ?? [];
  const safeAutomationTemplates = props.automationTemplates ?? [];
  const safeAutomationRules = props.automationRules ?? [];
  const safeListings = props.listings ?? [];
  const safeApplications = props.applications ?? [];
  const safeVendors = props.vendors ?? [];
  const sortedVendors = [...safeVendors].sort((left, right) => {
    if (left.preferred !== right.preferred) {
      return Number(right.preferred) - Number(left.preferred);
    }
    return left.name.localeCompare(right.name);
  });

  const isOwnerRole = props.data.profileRole === "owner";
  const isManagerRole = props.data.profileRole === "manager";
  const canManagePortfolio = isOwnerRole || isManagerRole;
  const occupancy =
    props.data.kpis.totalUnits > 0
      ? Math.round((props.data.kpis.occupiedUnits / props.data.kpis.totalUnits) * 100)
      : 0;
  const chargeBadgeCount = props.data.charges.filter(
    (charge) => charge.status === "pending" || charge.status === "late"
  ).length;
  const maintenanceBadgeCount = safeTickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const inboxBadgeCount = safeInboxThreads.length;
  const notificationBadgeCount = safeNotifications.filter((notification) => !notification.readAt).length;
  const hasNotificationsSection = Boolean(props.onMarkNotificationRead);
  const hasActivitySection = isOwnerRole || isManagerRole;
  const hasInboxSection = Boolean(props.onMarkNotificationRead);
  const hasAutomationsSection = isOwnerRole || isManagerRole;
  const hasOwnershipSection = Boolean(
    props.onCreateOwnershipAccount && props.onLinkPropertyToOwnershipAccount
  );
  const hasInvitationsSection = Boolean(
    props.onInviteTenant && props.onInviteManager && props.onResendInvite
  );
  const hasLeasingSection = Boolean(canManagePortfolio && hasInvitationsSection);
  const hasApplicationsSection = Boolean(
    canManagePortfolio && safeCapabilities.leasingPipelineEnabled
  );
  const hasDocumentsSection = Boolean(
    props.onCreateDocumentTemplate &&
      props.onDeleteDocumentTemplate &&
      props.onCreateDocumentPacket &&
      props.onSendDocumentPacket
  );
  const hasVendorsSection = Boolean(props.onCreateVendor);
  const hasExpensesSection = Boolean(
    canManagePortfolio && props.onCreateExpense && props.onUpdateExpense && props.onDeleteExpense
  );
  const hasAnalyticsSection = Boolean(canManagePortfolio && safeAnalytics.enabled);

  const [ownerWorkflowMode, setOwnerWorkflowMode] = useState<OwnerWorkflowMode>(
    props.initialOwnerWorkflowMode ?? "daily_ops"
  );
  const [managerWorkflowMode, setManagerWorkflowMode] = useState<ManagerWorkflowMode>(
    props.initialManagerWorkflowMode ?? "daily_ops"
  );

  useEffect(() => {
    const nextMode = props.initialOwnerWorkflowMode;
    if (!nextMode) {
      return;
    }
    setOwnerWorkflowMode((current) => (current === nextMode ? current : nextMode));
  }, [props.initialOwnerWorkflowMode]);

  useEffect(() => {
    const nextMode = props.initialManagerWorkflowMode;
    if (!nextMode) {
      return;
    }
    setManagerWorkflowMode((current) => (current === nextMode ? current : nextMode));
  }, [props.initialManagerWorkflowMode]);

  const allSectionItems = useMemo(
    () =>
      buildAllSectionItems({
        chargeBadgeCount,
        maintenanceBadgeCount,
        inboxBadgeCount,
        notificationBadgeCount,
        hasActivitySection,
        hasAnalyticsSection,
        hasLeasingSection,
        hasApplicationsSection,
        hasInboxSection,
        hasAutomationsSection,
        hasNotificationsSection,
        hasOwnershipSection,
        hasInvitationsSection,
        hasDocumentsSection,
        hasVendorsSection,
        hasExpensesSection
      }),
    [
      chargeBadgeCount,
      maintenanceBadgeCount,
      inboxBadgeCount,
      notificationBadgeCount,
      hasActivitySection,
      hasAnalyticsSection,
      hasLeasingSection,
      hasApplicationsSection,
      hasInboxSection,
      hasAutomationsSection,
      hasNotificationsSection,
      hasOwnershipSection,
      hasInvitationsSection,
      hasDocumentsSection,
      hasVendorsSection,
      hasExpensesSection
    ]
  );
  const ownerModeNavItems = useMemo(
    () => (isOwnerRole ? getOwnerModeNavItems({ hasAnalyticsSection }) : []),
    [hasAnalyticsSection, isOwnerRole]
  );
  const managerModeNavItems = useMemo(
    () => (isManagerRole ? getManagerModeNavItems() : []),
    [isManagerRole]
  );
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
  const [activeSection, setActiveSection] = useState(() => {
    if (!props.initialSectionId) {
      return "overview";
    }
    return sectionItems.some((item) => item.id === props.initialSectionId)
      ? props.initialSectionId
      : "overview";
  });

  useEffect(() => {
    if (!props.initialSectionId) {
      return;
    }
    if (sectionItems.some((item) => item.id === props.initialSectionId)) {
      setActiveSection(props.initialSectionId);
    }
  }, [props.initialSectionId, sectionItems]);

  useEffect(() => {
    if (!sectionItems.some((item) => item.id === activeSection)) {
      setActiveSection(sectionItems[0]?.id ?? "overview");
    }
  }, [activeSection, sectionItems]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const activeSectionIndex = sectionItems.findIndex((item) => item.id === activeSection);
  const activeSectionLabel =
    sectionItems.find((item) => item.id === activeSection)?.label ?? "Overview";
  const goToPreviousSection = () => {
    if (activeSectionIndex <= 0) {
      if (isOwnerRole && ownerWorkflowMode === "records") {
        setOwnerWorkflowMode("daily_ops");
        setActiveSection("analytics");
      }
      return;
    }
    setActiveSection(sectionItems[activeSectionIndex - 1].id);
  };
  const goToNextSection = () => {
    if (activeSectionIndex < 0) {
      return;
    }
    if (activeSectionIndex >= sectionItems.length - 1) {
      if (isOwnerRole && ownerWorkflowMode === "daily_ops") {
        setOwnerWorkflowMode("records");
        setActiveSection("documents");
      }
      return;
    }
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

  const handleModeChange = (
    mode: OwnerWorkflowMode | ManagerWorkflowMode,
    meta: typeof ownerWorkflowModeMeta | typeof managerWorkflowModeMeta,
    setMode: typeof setOwnerWorkflowMode | typeof setManagerWorkflowMode
  ) => {
    setMode(mode as never);
    const nextSection = meta[mode as keyof typeof meta].sections[0];
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

  const sidebarItems = isOwnerRole
    ? ownerModeNavItems
    : isManagerRole
      ? managerModeNavItems
      : sectionItems;
  const sidebarActiveItemId = isOwnerRole
    ? activeSection === "analytics"
      ? "analytics"
      : `owner:${ownerWorkflowMode}`
    : isManagerRole
      ? `manager:${managerWorkflowMode}`
      : activeSection;
  const reportsHref = isOwnerRole
    ? props.activeAccountId
      ? `/owner/reports?account=${encodeURIComponent(props.activeAccountId)}`
      : "/owner/reports"
    : isManagerRole
      ? "/owner/reports"
      : null;
  const accountSwitcher =
    isOwnerRole && props.activeAccountId && safeOwnershipAccounts.length > 0 ? (
      <AccountSwitcher
        accounts={safeOwnershipAccounts}
        activeAccountId={props.activeAccountId}
      />
    ) : null;

  const searchItems = useMemo<GlobalSearchItem[]>(() => {
    const basePath = isOwnerRole ? "/owner" : isManagerRole ? "/manager" : null;
    if (!basePath) {
      return [];
    }

    const accountQuery =
      isOwnerRole && props.activeAccountId
        ? `&account=${encodeURIComponent(props.activeAccountId)}`
        : "";
    const sectionHref = (section: string) => `${basePath}?section=${section}${accountQuery}`;

    return [
      ...safePortfolio.properties.map((property) => ({
        id: `property:${property.id}`,
        label: property.name,
        category: "Properties",
        href: sectionHref("portfolio"),
        description: [property.addressLine1, property.city, property.state]
          .filter(Boolean)
          .join(", "),
        keywords: [property.name, property.addressLine1, property.city, property.state]
      })),
      ...safePortfolio.units.map((unit) => ({
        id: `unit:${unit.id}`,
        label: `Unit ${unit.unitNumber}`,
        category: "Units",
        href: sectionHref("units"),
        description: unit.propertyName,
        keywords: [unit.unitNumber, unit.propertyName]
      })),
      ...safePortfolio.leases.map((lease) => ({
        id: `lease:${lease.id}`,
        label: lease.tenantEmail,
        category: "Leases",
        href: sectionHref("leases"),
        description: `${lease.unitLabel} • ${formatDate(lease.endDate)}`,
        keywords: [lease.tenantEmail, lease.unitLabel, lease.leaseStatus]
      })),
      ...safePortfolio.tenants.map((tenant) => ({
        id: `tenant:${tenant.id}`,
        label: tenant.fullName || tenant.email,
        category: "Tenants",
        href: sectionHref("leases"),
        description: tenant.email,
        keywords: [tenant.fullName, tenant.email]
      })),
      ...safeTickets.map((ticket) => ({
        id: `ticket:${ticket.id}`,
        label: ticket.title,
        category: "Maintenance",
        href: sectionHref("maintenance"),
        description: `${ticket.propertyName}${ticket.unitNumber ? ` • Unit ${ticket.unitNumber}` : ""}`,
        keywords: [ticket.title, ticket.description, ticket.propertyName, ticket.unitNumber ?? ""]
      })),
      ...props.data.charges.map((charge) => ({
        id: `charge:${charge.id}`,
        label: `${charge.propertyName} • Unit ${charge.unitNumber}`,
        category: "Charges",
        href: sectionHref("charges"),
        description: `${charge.tenantName} • ${charge.status} • ${formatDate(charge.dueDate)}`,
        keywords: [charge.propertyName, charge.unitNumber, charge.tenantName, charge.status]
      })),
      ...safeAuditLogs.map((log) => ({
        id: `activity:${log.id}`,
        label: log.action.replace(/_/g, " "),
        category: "Activity",
        href: sectionHref("activity"),
        description: log.userName,
        keywords: [log.action, log.entityType, log.userName]
      }))
    ];
  }, [
    isOwnerRole,
    isManagerRole,
    props.activeAccountId,
    props.data.charges,
    safeAuditLogs,
    safePortfolio.leases,
    safePortfolio.properties,
    safePortfolio.tenants,
    safePortfolio.units,
    safeTickets
  ]);

  const handleSidebarSelect = (itemId: string) => {
    if (itemId === "analytics" && isOwnerRole) {
      setOwnerWorkflowMode("daily_ops");
      setActiveSection("analytics");
      return;
    }
    if (itemId === "notifications") {
      if (isOwnerRole) {
        setOwnerWorkflowMode("daily_ops");
      }
      if (isManagerRole) {
        setManagerWorkflowMode("daily_ops");
      }
      setActiveSection("notifications");
      return;
    }
    if (isOwnerRole && itemId.startsWith("owner:")) {
      handleModeChange(itemId.replace("owner:", "") as OwnerWorkflowMode, ownerWorkflowModeMeta, setOwnerWorkflowMode);
      return;
    }
    if (isManagerRole && itemId.startsWith("manager:")) {
      handleModeChange(itemId.replace("manager:", "") as ManagerWorkflowMode, managerWorkflowModeMeta, setManagerWorkflowMode);
      return;
    }
    setActiveSection(itemId);
  };

  const sectionRendererProps = {
    ...props,
    activeSection,
    occupancy,
    canManagePortfolio,
    safePortfolio,
    tickets: safeTickets,
    invitations: props.invitations ?? [],
    safeNotifications,
    safeInboxThreads,
    safeDocuments,
    safeAutomationTemplates,
    safeAutomationRules,
    safeListings,
    safeApplications,
    safeVendors,
    safeExpenses,
    safeAnalytics,
    auditLogs: safeAuditLogs,
    rentIncreaseHistory: safeRentIncreaseHistory,
    safeOwnershipAccounts,
    safeCapabilities,
    sortedVendors,
    hasLeasingSection,
    hasApplicationsSection,
    hasInboxSection,
    hasAutomationsSection,
    hasNotificationsSection,
    hasOwnershipSection,
    hasInvitationsSection,
    hasDocumentsSection,
    hasVendorsSection,
    hasExpensesSection,
    hasAnalyticsSection,
    hasActivitySection,
    goToSectionIfVisible,
    handleTenantInviteSuccess,
    handleManagerInviteSuccess,
    handleOwnerInviteSuccess,
    handleVendorCreatedSuccess,
    handlePropertyCreated,
    handleUnitCreated,
    handleLeaseCreated
  } satisfies SectionRendererProps;

  const layoutProps: LayoutProps = {
    userEmail: props.userEmail,
    role: props.data.profileRole,
    fullName: props.fullName,
    nickname: props.nickname,
    avatarUrl: props.avatarUrl,
    stripeConnected: props.stripeConnected,
    onSignOut: props.onSignOut,
    items: sidebarItems,
    activeItemId: sidebarActiveItemId,
    onSelectItem: handleSidebarSelect,
    unreadNotificationCount: notificationBadgeCount,
    searchItems,
    reportsHref,
    accountSwitcher
  };

  return {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    goToNextSection,
    goToPreviousSection,
    isEmptyOwner: props.isEmpty && isOwnerRole,
    isManagerRole,
    isOwnerRole,
    layoutProps,
    occupancy,
    ownerWorkflowMode,
    resolvedGamification,
    safePortfolio,
    sectionItems,
    sectionRendererProps,
    showOnboardingWizard:
      isOwnerRole && safePortfolio.properties.length > 0 && safePortfolio.units.length === 0 && Boolean(props.onInviteTenant)
  };
}
