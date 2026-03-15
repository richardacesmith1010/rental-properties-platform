"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioData } from "@/lib/portfolio";
import type { MaintenanceTicket } from "@/lib/maintenance";
import type { NotificationDTO } from "@/lib/notifications";
import type { OwnerDocumentsData } from "@/lib/documents";
import type { VendorDTO } from "@/lib/vendors";
import type { FeatureCapabilitiesDTO } from "@/lib/feature-capabilities";
import type { OwnershipAccountDTO } from "@/lib/ownership";
import type { ExpenseDashboardData } from "@/lib/expenses";
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import type { AnalyticsDashboardData } from "@/lib/analytics";
import type { AuditLogEntry } from "@/lib/audit";
import type { RentIncreaseEntry } from "@/lib/rent-increases";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { ConnectBanner } from "@/components/dashboard/connect-banner";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import { SidebarNav, MobileTopBar, type NavItem } from "./sidebar-nav";
import type { GlobalSearchItem } from "./global-search";
import { SectionRenderer } from "./section-renderer";
import type { DashboardProps } from "./types";
import {
  buildAllSectionItems,
  getManagerModeNavItems,
  getOwnerModeNavItems,
  managerWorkflowModeMeta,
  ownerWorkflowModeMeta,
  type ManagerWorkflowMode,
  type OwnerWorkflowMode
} from "./dashboard-config";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/alert";

const EMPTY_TICKETS: MaintenanceTicket[] = [];
const EMPTY_AUDIT_LOGS: AuditLogEntry[] = [];
const EMPTY_RENT_INCREASE_HISTORY: RentIncreaseEntry[] = [];

export function Dashboard({
  data,
  isEmpty = false,
  activeAccountId,
  portfolio,
  tickets,
  invitations,
  notifications,
  inboxThreads,
  documents,
  automationTemplates,
  automationRules,
  vendors,
  expensesData,
  capabilities,
  ownershipAccounts,
  listings,
  applications,
  applicationCount,
  approvedApplicationCount,
  gamification,
  analyticsData,
  auditLogs,
  rentIncreaseHistory,
  generatedMessage,
  initialSectionId,
  initialOwnerWorkflowMode,
  initialManagerWorkflowMode,
  userEmail,
  fullName,
  nickname,
  avatarUrl,
  stripeConnected,
  ownerConnectedMap,
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
  onRenewLease,
  onTerminateLease,
  onPayCharge,
  onRecordManualPayment,
  onUpdateTicketStatus,
  onAddTicketComment,
  onInviteTenant,
  onInviteManager,
  onInviteOwner,
  onResendInvite,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onCreateInboxThread,
  onSendInboxMessage,
  onEnableAutomation,
  onDisableAutomation,
  onCreateRentalListing,
  onUpdateListingStatus,
  onCreateApplication,
  onReviewApplication,
  onAddApplicationNote,
  onRecordScreeningScore,
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
  onLinkPropertyToOwnershipAccount,
  onInitiateAccountStripeConnect,
  onUpdateManagementFee
}: DashboardProps) {
  const resolvedGamification = gamification ?? {
    totalXp: 0,
    currentLevel: 1,
    streakCount: 0,
    streakLastDate: null
  };
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
  const safeInboxThreads: InboxThreadDTO[] = inboxThreads ?? [];
  const safeTickets = useMemo(() => tickets ?? EMPTY_TICKETS, [tickets]);
  const safeVendors: VendorDTO[] = vendors ?? [];
  const safeAutomationTemplates: AutomationTemplateDTO[] = automationTemplates ?? [];
  const safeAutomationRules: AutomationRuleDTO[] = automationRules ?? [];
  const safeListings: RentalListingDTO[] = listings ?? [];
  const safeApplications: ApplicationDTO[] = applications ?? [];
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
  const safeAuditLogs = useMemo(() => auditLogs ?? EMPTY_AUDIT_LOGS, [auditLogs]);
  const safeRentIncreaseHistory = useMemo(
    () => rentIncreaseHistory ?? EMPTY_RENT_INCREASE_HISTORY,
    [rentIncreaseHistory]
  );
  const safeAnalytics: AnalyticsDashboardData = analyticsData ?? {
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
  const hasActivitySection = data.profileRole === "owner" || data.profileRole === "manager";
  const hasInboxSection = Boolean(onMarkNotificationRead);
  const hasAutomationsSection = Boolean(data.profileRole === "owner" || data.profileRole === "manager");
  const hasOwnershipSection = Boolean(onCreateOwnershipAccount && onLinkPropertyToOwnershipAccount);
  const hasInvitationsSection = Boolean(onInviteTenant && onInviteManager && onResendInvite);
  const hasLeasingSection = Boolean(canManagePortfolio && hasInvitationsSection);
  const hasApplicationsSection = Boolean(
    canManagePortfolio && safeCapabilities.leasingPipelineEnabled
  );
  const hasDocumentsSection = Boolean(
    onCreateDocumentTemplate &&
      onDeleteDocumentTemplate &&
      onCreateDocumentPacket &&
      onSendDocumentPacket
  );
  const hasVendorsSection = Boolean(onCreateVendor);
  const hasExpensesSection = Boolean(
    (data.profileRole === "owner" || data.profileRole === "manager") &&
      onCreateExpense &&
      onUpdateExpense &&
      onDeleteExpense
  );
  const hasAnalyticsSection = Boolean(
    (data.profileRole === "owner" || data.profileRole === "manager") && safeAnalytics.enabled
  );
  const isOwnerRole = data.profileRole === "owner";
  const isManagerRole = data.profileRole === "manager";
  const chargeBadgeCount = data.charges.filter(
    (charge) => charge.status === "pending" || charge.status === "late"
  ).length;
  const maintenanceBadgeCount = safeTickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const inboxBadgeCount = safeInboxThreads.length;
  const notificationBadgeCount = safeNotifications.filter(
    (notification) => !notification.readAt
  ).length;
  const [ownerWorkflowMode, setOwnerWorkflowMode] = useState<OwnerWorkflowMode>(
    initialOwnerWorkflowMode ?? "daily_ops"
  );
  const [managerWorkflowMode, setManagerWorkflowMode] = useState<ManagerWorkflowMode>(
    initialManagerWorkflowMode ?? "daily_ops"
  );
  const allSectionItems = useMemo<NavItem[]>(
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
  const ownerModeNavItems = useMemo<NavItem[]>(
    () => (isOwnerRole ? getOwnerModeNavItems({ hasAnalyticsSection }) : []),
    [hasAnalyticsSection, isOwnerRole]
  );
  const managerModeNavItems = useMemo<NavItem[]>(
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
    if (activeSectionIndex < 0) return;
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
    ? activeAccountId
      ? `/owner/reports?account=${encodeURIComponent(activeAccountId)}`
      : "/owner/reports"
    : isManagerRole
      ? "/owner/reports"
      : null;
  const renderAccountSwitcher = () =>
    isOwnerRole && activeAccountId && safeOwnershipAccounts.length > 0 ? (
      <AccountSwitcher
        accounts={safeOwnershipAccounts}
        activeAccountId={activeAccountId}
      />
    ) : null;
  const searchItems = useMemo<GlobalSearchItem[]>(() => {
    const basePath = isOwnerRole ? "/owner" : isManagerRole ? "/manager" : null;
    if (!basePath) {
      return [];
    }
    const accountQuery =
      isOwnerRole && activeAccountId ? `&account=${encodeURIComponent(activeAccountId)}` : "";
    const sectionHref = (section: string) => `${basePath}?section=${section}${accountQuery}`;

    return [
      ...safePortfolio.properties.map((property) => ({
        id: `property:${property.id}`,
        label: property.name,
        category: "Properties",
        href: sectionHref("portfolio"),
        description: [property.addressLine1, property.city, property.state].filter(Boolean).join(", "),
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
      ...data.charges.map((charge) => ({
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
    activeAccountId,
    data.charges,
    isManagerRole,
    isOwnerRole,
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
  if (isEmpty && isOwnerRole) {
    return (
      <div className="app-surface flex min-h-screen flex-col lg:flex-row">
        <MobileTopBar
          userEmail={userEmail}
          role={data.profileRole}
          fullName={fullName}
          nickname={nickname}
          avatarUrl={avatarUrl}
          stripeConnected={stripeConnected}
          items={sidebarItems}
          activeItemId={sidebarActiveItemId}
          onSignOut={onSignOut}
          onSelectItem={handleSidebarSelect}
          unreadNotificationCount={notificationBadgeCount}
          searchItems={searchItems}
          reportsHref={reportsHref}
          accountSwitcher={renderAccountSwitcher()}
        />
        <SidebarNav
          userEmail={userEmail}
          role={data.profileRole}
          fullName={fullName}
          nickname={nickname}
          avatarUrl={avatarUrl}
          stripeConnected={stripeConnected}
          onSignOut={onSignOut}
          items={sidebarItems}
          activeItemId={sidebarActiveItemId}
          onSelectItem={handleSidebarSelect}
          unreadNotificationCount={notificationBadgeCount}
          searchItems={searchItems}
          reportsHref={reportsHref}
          accountSwitcher={renderAccountSwitcher()}
        />
        <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:ml-[260px]">
          <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
          <div className="w-full max-w-md space-y-4">
            {stripeConnected === false ? <ConnectBanner connected={false} role="owner" /> : null}
            <WelcomeCard
              fullName={fullName}
              nickname={nickname}
              role={data.profileRole}
              stripeConnected={stripeConnected === true}
              hasProperty={safePortfolio.properties.length > 0}
              hasUnit={safePortfolio.units.length > 0}
              hasLease={safePortfolio.leases.length > 0}
              onAddProperty={() => {
                window.location.href = `/owner?mode=new_property&section=operations${
                  activeAccountId ? `&account=${encodeURIComponent(activeAccountId)}` : ""
                }`;
              }}
            />
          </div>
        </main>
      </div>
    );
  }
  return (
    <div className="app-surface flex min-h-screen flex-col lg:flex-row">
      <MobileTopBar
        userEmail={userEmail}
        role={data.profileRole}
        fullName={fullName}
        nickname={nickname}
        avatarUrl={avatarUrl}
        stripeConnected={stripeConnected}
        items={sidebarItems}
        activeItemId={sidebarActiveItemId}
        onSignOut={onSignOut}
        onSelectItem={handleSidebarSelect}
        unreadNotificationCount={notificationBadgeCount}
        searchItems={searchItems}
        reportsHref={reportsHref}
        accountSwitcher={renderAccountSwitcher()}
      />
      <SidebarNav
        userEmail={userEmail}
        role={data.profileRole}
        fullName={fullName}
        nickname={nickname}
        avatarUrl={avatarUrl}
        stripeConnected={stripeConnected}
        onSignOut={onSignOut}
        items={sidebarItems}
        activeItemId={sidebarActiveItemId}
        onSelectItem={handleSidebarSelect}
        unreadNotificationCount={notificationBadgeCount}
        searchItems={searchItems}
        reportsHref={reportsHref}
        accountSwitcher={renderAccountSwitcher()}
      />
      <main id="main-content" className="relative flex-1 lg:ml-[260px]">
        <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
        {activeSection === "overview" && (
          <div className="px-6 pt-6 lg:px-8 lg:pt-8" id="overview">
            <DashboardHeader
              role={data.profileRole}
              kpis={data.kpis}
              occupancy={occupancy}
              propertyCount={safePortfolio.properties.length}
              userEmail={userEmail}
              nickname={nickname}
              fullName={fullName}
              gamificationSummary={
                <GamificationSummary
                  totalXp={resolvedGamification.totalXp}
                  currentLevel={resolvedGamification.currentLevel}
                  streakCount={resolvedGamification.streakCount}
                  role={data.profileRole}
                  className="w-full"
                />
              }
            />
          </div>
        )}
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {generatedMessage && (
            <Alert variant="success" className="rounded-xl px-4 py-3">
              {generatedMessage}
            </Alert>
          )}
          {(isOwnerRole || isManagerRole) && stripeConnected === false ? (
            <ConnectBanner
              connected={false}
              role={isOwnerRole ? "owner" : "manager"}
            />
          ) : null}
          {(isOwnerRole || isManagerRole) && activeWorkflowMeta && activeSection === "overview" && (
            <div className="domus-glass flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-zinc-900">
                {activeWorkflowMeta.label}
              </p>
              <p className="text-sm text-zinc-500">
                {activeWorkflowMeta.description}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">{activeSectionLabel}</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToPreviousSection}
                disabled={activeSectionIndex <= 0 && !(isOwnerRole && ownerWorkflowMode === "records")}
                title="Previous section"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToNextSection}
                disabled={
                  activeSectionIndex < 0 ||
                  (activeSectionIndex >= sectionItems.length - 1 &&
                    !(isOwnerRole && ownerWorkflowMode === "daily_ops"))
                }
                title="Next section"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <section id={activeSection} className="space-y-6">
            <SectionRenderer
              activeSection={activeSection}
              occupancy={occupancy}
              data={data}
              canManagePortfolio={canManagePortfolio}
              safePortfolio={safePortfolio}
              tickets={tickets ?? []}
              invitations={invitations ?? []}
              safeNotifications={safeNotifications}
              safeInboxThreads={safeInboxThreads}
              safeDocuments={safeDocuments}
              safeAutomationTemplates={safeAutomationTemplates}
              safeAutomationRules={safeAutomationRules}
              safeListings={safeListings}
              safeApplications={safeApplications}
              safeVendors={safeVendors}
              safeExpenses={safeExpenses}
              safeAnalytics={safeAnalytics}
              auditLogs={safeAuditLogs}
              rentIncreaseHistory={safeRentIncreaseHistory}
              safeOwnershipAccounts={safeOwnershipAccounts}
              safeCapabilities={safeCapabilities}
              sortedVendors={sortedVendors}
              hasLeasingSection={hasLeasingSection}
              hasApplicationsSection={hasApplicationsSection}
              hasInboxSection={hasInboxSection}
              hasAutomationsSection={hasAutomationsSection}
              hasNotificationsSection={hasNotificationsSection}
              hasOwnershipSection={hasOwnershipSection}
              hasInvitationsSection={hasInvitationsSection}
              hasDocumentsSection={hasDocumentsSection}
              hasVendorsSection={hasVendorsSection}
              hasExpensesSection={hasExpensesSection}
              hasAnalyticsSection={hasAnalyticsSection}
              hasActivitySection={hasActivitySection}
              applicationCount={applicationCount}
              approvedApplicationCount={approvedApplicationCount}
              stripeConnected={stripeConnected}
              ownerConnectedMap={ownerConnectedMap}
              onGenerateChargesHref={onGenerateChargesHref}
              onPayCharge={onPayCharge}
              onRecordManualPayment={onRecordManualPayment}
              onUpdateTicketStatus={onUpdateTicketStatus}
              onInviteTenant={onInviteTenant}
              onInviteManager={onInviteManager}
              onInviteOwner={onInviteOwner}
              onResendInvite={onResendInvite}
              onMarkNotificationRead={onMarkNotificationRead}
              onMarkAllNotificationsRead={onMarkAllNotificationsRead}
              onCreateInboxThread={onCreateInboxThread}
              onSendInboxMessage={onSendInboxMessage}
              onEnableAutomation={onEnableAutomation}
              onDisableAutomation={onDisableAutomation}
              onCreateRentalListing={onCreateRentalListing}
              onUpdateListingStatus={onUpdateListingStatus}
              onCreateApplication={onCreateApplication}
              onReviewApplication={onReviewApplication}
              onAddApplicationNote={onAddApplicationNote}
              onRecordScreeningScore={onRecordScreeningScore}
              onCreateDocumentTemplate={onCreateDocumentTemplate}
              onDeleteDocumentTemplate={onDeleteDocumentTemplate}
              onCreateDocumentPacket={onCreateDocumentPacket}
              onSendDocumentPacket={onSendDocumentPacket}
              onUploadPropertyFile={onUploadPropertyFile}
              onDeletePropertyFile={onDeletePropertyFile}
              onUpdateFileVisibility={onUpdateFileVisibility}
              onCreateVendor={onCreateVendor}
              onUpdateVendor={onUpdateVendor}
              onAssignVendor={onAssignVendor}
              onUploadMaintenancePhoto={onUploadMaintenancePhoto}
              onCreateExpense={onCreateExpense}
              onUpdateExpense={onUpdateExpense}
              onDeleteExpense={onDeleteExpense}
              onCreateOwnershipAccount={onCreateOwnershipAccount}
              onLinkPropertyToOwnershipAccount={onLinkPropertyToOwnershipAccount}
              onInitiateAccountStripeConnect={onInitiateAccountStripeConnect}
              onUpdateManagementFee={onUpdateManagementFee}
              onCreateProperty={onCreateProperty}
              onCreateUnit={onCreateUnit}
              onCreateLease={onCreateLease}
              onUpdateProperty={onUpdateProperty}
              onDeleteProperty={onDeleteProperty}
              onUpdateUnit={onUpdateUnit}
              onDeleteUnit={onDeleteUnit}
              onUpdateLease={onUpdateLease}
              onDeleteLease={onDeleteLease}
              onRenewLease={onRenewLease}
              onTerminateLease={onTerminateLease}
              onAddTicketComment={onAddTicketComment}
              goToSectionIfVisible={goToSectionIfVisible}
              handleTenantInviteSuccess={handleTenantInviteSuccess}
              handleManagerInviteSuccess={handleManagerInviteSuccess}
              handleOwnerInviteSuccess={handleOwnerInviteSuccess}
              handleVendorCreatedSuccess={handleVendorCreatedSuccess}
              handlePropertyCreated={handlePropertyCreated}
              handleUnitCreated={handleUnitCreated}
              handleLeaseCreated={handleLeaseCreated}
            />
          </section>
        </div>
      </main>
      {isOwnerRole && portfolio && portfolio.properties.length > 0 && portfolio.units.length === 0 && onInviteTenant && (
        <OnboardingWizard
          propertyId={portfolio.properties[0].id}
          propertyName={portfolio.properties[0].name}
          stripeConnected={stripeConnected === true}
          unitCount={portfolio.units.length}
          onCreateUnit={onCreateUnit}
          onCreateLease={onCreateLease}
          onInviteTenant={onInviteTenant}
        />
      )}
    </div>
  );
}
