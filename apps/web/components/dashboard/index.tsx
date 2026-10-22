"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnnouncementComposer } from "@/components/dashboard/announcement-composer";
import { ownerPageDescriptions } from "./dashboard-config";
import { OwnerAddMenu } from "./owner-add-menu";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { LeaseWizard } from "@/components/dashboard/lease-wizard";
import { NotificationPauseBanner } from "@/components/dashboard/notification-pause-banner";
import { OwnerDailyOpsHome } from "@/components/dashboard/owner-daily-ops-home";
import { PropertyWizard } from "@/components/dashboard/property-wizard";
import { TenantInviteWizard } from "@/components/dashboard/tenant-invite-wizard";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DashboardLayout } from "./dashboard-layout";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { useDashboardData } from "./dashboard-data-loader";
import type { OperationTask } from "./operations-section";
import { SectionRenderer } from "./section-renderer";
import { SectionSkeleton } from "./section-map";
import type { DashboardProps } from "./types";
import { getOwnerBankCardState } from "@/lib/owner-bank-status";
import { useTimeOfDayGreeting } from "./use-time-of-day-greeting";

const AiAssistant = dynamic(
  () => import("@/components/dashboard/ai-assistant").then((module) => module.AiAssistant),
  { ssr: false }
);

function PageHeader({
  title,
  pageCountLabel,
  description,
  actions
}: {
  title: string;
  pageCountLabel?: string | null;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className={[
      "flex shrink-0 flex-col gap-4 border-b-2 border-[var(--ink)] px-4 py-4 sm:flex-row sm:items-end",
      "sm:justify-between sm:px-6"
    ].join(" ")}>
      <div className="min-w-0 space-y-1">
        <h2 className="truncate font-display text-[22px] font-semibold text-[var(--ink)]">
          {title}
        </h2>
        {description ? <p className="text-sm text-[var(--muted)]">{description}</p> : null}
        {pageCountLabel ? <p className="domus-section-label">{pageCountLabel}</p> : null}
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        {actions}
      </div>
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const greeting = useTimeOfDayGreeting();
  const [isAnnouncementComposerOpen, setIsAnnouncementComposerOpen] = useState(false);
  const [initialOperationsTask, setInitialOperationsTask] = useState<OperationTask | undefined>(undefined);
  const [initialOperationsPropertyId, setInitialOperationsPropertyId] = useState<string | null>(null);
  const openAddUnit = () => {
    setInitialOperationsTask("unit");
    setInitialOperationsPropertyId(null);
    sectionRendererProps.openSection("operations");
  };
  const {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    closePropertyWizard,
    closeLeaseWizard,
    closeTenantInviteWizard,
    commandPaletteProps,
    displayDashboardData,
    financialOverviewData,
    selectedPropertyId,
    filteredPortfolio,
    homeActionItems,
    isManagerRole,
    isOwnerRole,
    isOwnerDailyOpsHomePage,
    isUnknownSection,
    isLeaseWizardOpen,
    openLeaseWizard,
    isPropertyWizardOpen,
    isTenantInviteWizardOpen,
    layoutProps,
    llcSetupPrompt,
    openPropertyWizard,
    openTenantInviteWizard,
    ownerOnboarding,
    occupancy,
    safePortfolio,
    sectionItems,
    sectionRendererProps,
    isSectionLoading,
    showOnboardingWizard
  } = useDashboardData(props);

  const displayName =
    props.nickname?.trim() ||
    props.fullName?.trim().split(/\s+/)[0] ||
    props.userEmail;
  const contentZoneLabel = activeSectionIndex >= 0 && sectionItems.length > 0
    ? `${activeSectionIndex + 1} of ${sectionItems.length}`
    : null;
  const isDailyOpsHomePage = isOwnerDailyOpsHomePage || (isManagerRole && activeSection === "overview");
  const onboardingDismissStorageKey = useMemo(
    () => `domus-owner-onboarding-dismissed:${props.userEmail}`,
    [props.userEmail]
  );
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const assistantAccountId = props.activeAccountId ?? props.ownershipAccounts?.[0]?.id ?? "";
  const ownerConnectHref = props.rentCollectionConnectHref ?? "/connect/onboard";
  const bankState = getOwnerBankCardState({
    rentCollectionConnected: props.rentCollectionConnected === true,
    profileStripeConnected: props.stripeConnected,
    connectHref: ownerConnectHref,
    accounts: props.ownershipAccounts ?? []
  });
  const showLlcSetupPrompt = Boolean(
    isOwnerRole &&
    isOwnerDailyOpsHomePage &&
    !isUnknownSection &&
    llcSetupPrompt.shouldShow
  );
  const contentZoneTitle = activeSectionLabel;
  const notificationsPausedUntil =
    props.notificationPreferenceSettings?.pausedUntil ?? null;
  const canSendAnnouncements =
    (isOwnerRole || isManagerRole) &&
    !!props.onCreateAnnouncement &&
    !!props.onGetAnnouncementRecipientCount;
  const announcementsReady = props.capabilities?.notificationsEnabled ?? false;
  const announcementButtonDisabled =
    !announcementsReady || (props.announcementProperties?.length ?? 0) === 0;
  const announcementButtonTitle = !announcementsReady
    ? props.capabilities?.warnings.notifications ??
      "Notifications are not ready yet."
    : announcementButtonDisabled
      ? "Add a property before sending announcements."
      : "Send a building-wide announcement to your tenants.";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setIsOnboardingDismissed(window.localStorage.getItem(onboardingDismissStorageKey) === "true");
  }, [onboardingDismissStorageKey]);

  const showOwnerOnboarding =
    isOwnerRole &&
    ownerOnboarding.shouldShow &&
    !showLlcSetupPrompt &&
    !isOnboardingDismissed &&
    !isUnknownSection &&
    activeSection === "overview";

  const handleDismissOnboarding = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(onboardingDismissStorageKey, "true");
    }
    setIsOnboardingDismissed(true);
  };

  const handleContinueOwnerOnboarding = (stepId: typeof ownerOnboarding.nextStepId) => {
    switch (stepId) {
      case "property":
        openPropertyWizard();
        return;
      case "unit":
        sectionRendererProps.openSection("units");
        return;
      case "lease":
        sectionRendererProps.openSection("leases");
        return;
      default:
        sectionRendererProps.openSection("overview");
    }
  };

  const renderedSectionContent = isSectionLoading ? (
    <SectionSkeleton
      label={isDailyOpsHomePage ? "Loading home..." : `Loading ${activeSectionLabel.toLowerCase()}...`}
    />
  ) : showOwnerOnboarding ? (
    <div className="flex h-full items-center justify-center">
      <WelcomeCard
        displayName={displayName}
        steps={ownerOnboarding.steps}
        onContinue={handleContinueOwnerOnboarding}
        onSkip={handleDismissOnboarding}
      />
    </div>
  ) : isDailyOpsHomePage ? (
    <OwnerDailyOpsHome
      bankState={bankState}
      isManagerView={isManagerRole}
      summary={homeActionItems}
      portfolio={safePortfolio}
      wallet={props.ownerWalletHome}
      showAccountName={(props.ownershipAccounts?.length ?? 0) > 1}
      selectedPropertyId={selectedPropertyId}
      onOpenLeaseWizard={openLeaseWizard}
      onSelectProperty={sectionRendererProps.onSelectProperty}
      onOpenSection={sectionRendererProps.openSection}
      onSendBatchPaymentReminder={props.onSendBatchPaymentReminder}
      onRecordManualPayment={props.onRecordManualPayment}
      financialOverview={financialOverviewData}
      llcSetupPrompt={
        showLlcSetupPrompt
          ? {
              accountName: llcSetupPrompt.accountName,
              memberCount: llcSetupPrompt.memberCount,
              propertyCount: llcSetupPrompt.propertyCount,
              onInviteMembers: () => sectionRendererProps.openSection("members"),
              onAddProperty: openPropertyWizard
            }
          : null
      }
    />
  ) : (
    <div className="min-h-full">
      <SectionRenderer
        {...sectionRendererProps}
        todayIso={props.todayIso}
        safePortfolio={activeSection === "charges" ? filteredPortfolio : safePortfolio}
        ownerWalletHome={props.ownerWalletHome}
        onAddHome={openPropertyWizard}
        onAddTenantToHome={(id) => { sectionRendererProps.onSelectProperty(id); openLeaseWizard(); }}
        initialOperationsTask={initialOperationsTask}
        initialOperationsPropertyId={initialOperationsPropertyId}
        onInitialOperationsStateConsumed={() => {
          setInitialOperationsTask(undefined);
          setInitialOperationsPropertyId(null);
        }}
      />
    </div>
  );

  return (
      <DashboardLayout
        {...layoutProps}
        mainClassName="relative flex min-h-0 flex-1 flex-col overflow-x-hidden lg:ml-[260px]"
      afterMain={
        <>
          {showOnboardingWizard &&
          props.onInviteTenant &&
          !isOnboardingDismissed &&
          !showOwnerOnboarding ? (
            <OnboardingWizard
              propertyId={safePortfolio.properties[0].id}
              propertyName={safePortfolio.properties[0].name}
              stripeConnected={props.stripeConnected === true}
              unitCount={safePortfolio.units.length}
              onCreateUnit={props.onCreateUnit}
              onCreateLease={props.onCreateLease}
              onInviteTenant={props.onInviteTenant}
            />
          ) : null}
          {isOwnerRole ? <CommandPalette {...commandPaletteProps} /> : null}
          {(isOwnerRole || isManagerRole) ? (
            <PropertyWizard
              open={isPropertyWizardOpen}
              accountId={props.activeAccountId}
              managerClients={isManagerRole ? props.clients : undefined}
              onCreateClientAccount={props.onCreateClientAccount}
              onOpenChange={(open) => {
                if (!open) {
                  closePropertyWizard();
                }
              }}
              onCreatePropertyWithSetup={props.onCreatePropertyWithSetup}
              bankConnected={isOwnerRole ? props.stripeConnected === true : undefined}
              onComplete={(propertyId) => {
                closePropertyWizard();
                if (propertyId && !isOwnerRole) {
                  sectionRendererProps.onSelectProperty(propertyId);
                }
                sectionRendererProps.openSection("overview");
              }}
            />
          ) : null}
          {(isOwnerRole || isManagerRole) ? (
            <LeaseWizard
              open={isLeaseWizardOpen}
              properties={filteredPortfolio.properties}
              units={filteredPortfolio.units}
              leases={filteredPortfolio.leases}
              tenants={filteredPortfolio.tenants}
              selectedPropertyId={sectionRendererProps.selectedPropertyId}
              onOpenChange={(open) => {
                if (!open) {
                  closeLeaseWizard();
                }
              }}
              onCreateLease={props.onCreateLease}
              onSendTenantInvite={props.onInviteTenant}
              onCreatePropertyAction={() => {
                closeLeaseWizard();
                setInitialOperationsTask(undefined);
                setInitialOperationsPropertyId(null);
                openPropertyWizard();
              }}
              onAddUnitAction={(propertyId) => {
                closeLeaseWizard();
                setInitialOperationsTask("unit");
                setInitialOperationsPropertyId(propertyId);
                sectionRendererProps.onSelectProperty(propertyId);
                sectionRendererProps.openSection("operations");
              }}
              onInviteTenantAction={() => {
                closeLeaseWizard();
                setInitialOperationsTask(undefined);
                setInitialOperationsPropertyId(null);
                closePropertyWizard();
                closeTenantInviteWizard();
                sectionRendererProps.openSection("invitations");
              }}
              onOpenSection={sectionRendererProps.openSection}
            />
          ) : null}
          {(isOwnerRole || isManagerRole) && props.onInviteTenant ? (
            <TenantInviteWizard
              open={isTenantInviteWizardOpen}
              properties={safePortfolio.properties}
              units={safePortfolio.units}
              leases={safePortfolio.leases}
              onOpenChange={(open) => {
                if (!open) {
                  closeTenantInviteWizard();
                }
              }}
              onInviteTenant={props.onInviteTenant}
              onAddUnit={isOwnerRole ? openAddUnit : undefined}
              onOpenSection={isOwnerRole ? () => sectionRendererProps.openSection("invitations") : sectionRendererProps.openSection}
            />
          ) : null}
          {canSendAnnouncements && props.announcementProperties ? (
            <AnnouncementComposer
              open={isAnnouncementComposerOpen}
              onClose={() => setIsAnnouncementComposerOpen(false)}
              properties={props.announcementProperties}
              onCreateAnnouncement={props.onCreateAnnouncement!}
              onGetEstimatedRecipientCount={props.onGetAnnouncementRecipientCount!}
            />
          ) : null}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-40 pt-3
        sm:px-4 sm:pb-40 sm:pt-4 lg:px-8 lg:pb-24 lg:pt-8">
        {props.generatedMessage ? (
          <Alert variant="success" className="mt-3 rounded-xl px-4 py-3">
            {props.generatedMessage}
          </Alert>
        ) : null}
        {isOwnerRole &&
        notificationsPausedUntil &&
        props.onResumeNotificationEmails ? (
          <NotificationPauseBanner
            pausedUntil={notificationsPausedUntil}
            onResume={props.onResumeNotificationEmails}
          />
        ) : null}

        {isOwnerRole ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            {activeSection !== "portfolio" && <div
              className={`flex w-full items-start justify-between gap-3 pt-4 pb-3 ${isOwnerDailyOpsHomePage
                ? "mx-auto max-w-[720px] border-b-2 border-[var(--ink)]"
                : "flex-col sm:flex-row border-b-2 border-[var(--ink)]"}`}
            >
              <div className={isOwnerDailyOpsHomePage ? "" : "min-w-0 break-words"}>
                {isDailyOpsHomePage ? (
                  <div>
                    <p className="text-sm text-[var(--muted)]">{greeting ? `${greeting}, ${displayName}` : displayName}</p>
                    <h1 className="font-display mt-1 text-[34px] font-semibold leading-tight text-[var(--ink)]">Home</h1>
                  </div>
                ) : (
                  <>
                    <h1 className="font-display break-words text-[34px] font-semibold leading-tight text-[var(--ink)]">{activeSectionLabel}</h1>
                    <p className="mt-1 text-[15px] text-[var(--muted)]">
                      {ownerPageDescriptions[activeSection] ?? "Manage your homes and the people who live there."}
                    </p>
                  </>
                )}
              </div>
              <div className={isOwnerDailyOpsHomePage
                ? "flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center"
                : "flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:shrink-0 sm:justify-end"}>
                {canSendAnnouncements && !isOwnerDailyOpsHomePage ? (
                  <Button type="button" variant="outline" className="min-h-11"
                    disabled={announcementButtonDisabled}
                    onClick={() => setIsAnnouncementComposerOpen(true)}
                    title={announcementButtonTitle}>
                    Send Announcement
                  </Button>
                ) : null}
                <OwnerAddMenu onAddHome={openPropertyWizard} onAddUnit={openAddUnit} onAddTenant={openTenantInviteWizard}
                  properties={safePortfolio.properties} onInviteManager={props.onInviteManager}
                  homeStyle={isOwnerDailyOpsHomePage}
                  onSendAnnouncement={isOwnerDailyOpsHomePage && canSendAnnouncements
                    ? () => setIsAnnouncementComposerOpen(true) : undefined}
                  announcementDisabled={announcementButtonDisabled} announcementTitle={announcementButtonTitle} />
              </div>
            </div>}
            <section id={isDailyOpsHomePage ? "daily-ops-home" : activeSection}
              className={isOwnerDailyOpsHomePage || (isOwnerRole && activeSection === "portfolio")
                ? "min-h-0 flex-1 pb-24 pt-3" :
                "domus-card min-h-0 flex-1 px-3 pb-24 pt-3 shadow-sm sm:rounded-2xl sm:px-5"}>
              {renderedSectionContent}
            </section>
          </div>
        ) : (
          <>
            <div className="mt-3 shrink-0 space-y-3">
              {!isManagerRole && activeSection === "overview" ? (
                <DashboardHeader
                  role={props.data.profileRole}
                  kpis={displayDashboardData.kpis}
                  occupancy={occupancy}
                  propertyCount={filteredPortfolio.properties.length}
                  userEmail={props.userEmail}
                  nickname={props.nickname}
                  fullName={props.fullName}
                />
              ) : null}
            </div>

            <div className="domus-card mt-4 flex min-h-0 flex-1 flex-col overflow-hidden shadow-sm sm:rounded-2xl">
              <PageHeader
                title={contentZoneTitle}
                pageCountLabel={isManagerRole ? null : contentZoneLabel}
                description={isManagerRole ? ownerPageDescriptions[activeSection] ?? "Manage your homes and the people who live there." : ""}
                actions={
                  isManagerRole && activeSection === "clients" && (props.clients?.length ?? 0) > 0 ? (
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => window.dispatchEvent(new Event("domus:open-client-sheet"))}
                      title="Add a client."
                    >
                      Add client
                    </Button>
                  ) : isManagerRole ? (
                    <OwnerAddMenu role="manager" onAddHome={openPropertyWizard} onAddTenant={openTenantInviteWizard} properties={safePortfolio.properties} />
                  ) : canSendAnnouncements ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      disabled={announcementButtonDisabled}
                      onClick={() => setIsAnnouncementComposerOpen(true)}
                      title={announcementButtonTitle}
                    >
                      Send Announcement
                    </Button>
                  ) : null
                }
              />

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-3 pb-40 pt-3
                sm:px-5 sm:pb-40 [-webkit-overflow-scrolling:touch]">
                <section id={activeSection} className="min-h-full">
                  {renderedSectionContent}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
      {(isOwnerRole || isManagerRole) ? (
        <AiAssistant accountId={assistantAccountId} ownerName={displayName} />
      ) : null}
    </DashboardLayout>
  );
}
