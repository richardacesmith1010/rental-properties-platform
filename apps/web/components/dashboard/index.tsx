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
import type { AutomationRuleDTO, AutomationTemplateDTO } from "@/lib/automations";
import type { InboxThreadDTO } from "@/lib/inbox";
import type { RentalListingDTO } from "@/lib/leasing";
import type { ApplicationDTO } from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DomMascot } from "@/components/gamification/dom-mascot";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { ConnectBanner } from "@/components/dashboard/connect-banner";
import { SidebarNav, MobileTopBar, type NavItem } from "./sidebar-nav";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
export function Dashboard({
  data,
  isEmpty = false,
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
  onPayCharge,
  onRecordManualPayment,
  onUpdateTicketStatus,
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
  const safeTickets: MaintenanceTicket[] = tickets ?? [];
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
    data.profileRole === "owner" && onCreateExpense && onUpdateExpense && onDeleteExpense
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
    () => (isOwnerRole ? getOwnerModeNavItems() : []),
    [isOwnerRole]
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
    ? `owner:${ownerWorkflowMode}`
    : isManagerRole
      ? `manager:${managerWorkflowMode}`
      : activeSection;
  const handleSidebarSelect = (itemId: string) => {
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
          onSignOut={onSignOut}
          onSelectItem={handleSidebarSelect}
          unreadNotificationCount={notificationBadgeCount}
        />
        <SidebarNav
          userEmail={userEmail}
          role={data.profileRole}
          fullName={fullName}
          nickname={nickname}
          avatarUrl={avatarUrl}
          onSignOut={onSignOut}
          items={sidebarItems}
          activeItemId={sidebarActiveItemId}
          onSelectItem={handleSidebarSelect}
          unreadNotificationCount={notificationBadgeCount}
        />
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:ml-[260px]">
          <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
          <div className="w-full max-w-md space-y-4">
            <ConnectBanner connected={stripeConnected === true} role="owner" />
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-3xl bg-violet-50/80 px-4 py-3">
              <DomMascot size="lg" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900">Add your first property</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Start by adding a property to your portfolio. You can add units, tenants, and leases after.
            </p>
            <Button
              type="button"
              className="mt-6"
              title="Open the guided property setup flow."
              onClick={() => {
                window.location.href = "/owner?mode=new_property&section=operations";
              }}
            >
              Add Property
            </Button>
          </div>
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
        onSignOut={onSignOut}
        onSelectItem={handleSidebarSelect}
        unreadNotificationCount={notificationBadgeCount}
      />
      <SidebarNav
        userEmail={userEmail}
        role={data.profileRole}
        fullName={fullName}
        nickname={nickname}
        avatarUrl={avatarUrl}
        onSignOut={onSignOut}
        items={sidebarItems}
        activeItemId={sidebarActiveItemId}
        onSelectItem={handleSidebarSelect}
        unreadNotificationCount={notificationBadgeCount}
      />
      <main className="relative flex-1 lg:ml-[260px]">
        <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
        <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-8">
          <div id="overview">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Operations Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {formatDate(new Date())}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-md sm:items-end">
            <GamificationSummary
              totalXp={resolvedGamification.totalXp}
              currentLevel={resolvedGamification.currentLevel}
              streakCount={resolvedGamification.streakCount}
              role={data.profileRole}
              className="w-full"
            />
            <Badge className="self-start border border-violet-200 bg-violet-50 text-violet-700 capitalize sm:self-end">
              {data.profileRole}
            </Badge>
          </div>
        </div>
        <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
          {generatedMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              {generatedMessage}
            </div>
          )}
          {(isOwnerRole || isManagerRole) && typeof stripeConnected === "boolean" ? (
            <ConnectBanner
              connected={stripeConnected}
              role={isOwnerRole ? "owner" : "manager"}
            />
          ) : null}
          {(isOwnerRole || isManagerRole) && activeWorkflowMeta && (
            <div className="flex flex-col gap-1 rounded-xl border border-zinc-200/80 bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                disabled={activeSectionIndex <= 0}
                title="Previous section"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goToNextSection}
                disabled={activeSectionIndex < 0 || activeSectionIndex >= sectionItems.length - 1}
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
    </div>
  );
}
