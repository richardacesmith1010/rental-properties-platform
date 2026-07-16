"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { AnnouncementComposer } from "@/components/dashboard/announcement-composer";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { CompactGreetingBar } from "@/components/dashboard/compact-greeting-bar";
import { ConnectBanner } from "@/components/dashboard/connect-banner";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { ContextualGreeting } from "@/components/dashboard/contextual-greeting";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { LeaseWizard } from "@/components/dashboard/lease-wizard";
import { NotificationPauseBanner } from "@/components/dashboard/notification-pause-banner";
import { OwnerDailyOpsHome } from "@/components/dashboard/owner-daily-ops-home";
import { PropertyWizard } from "@/components/dashboard/property-wizard";
import {
  StripeHealthBanner,
  type StripeHealthStatus
} from "@/components/dashboard/stripe-health-banner";
import { TenantInviteWizard } from "@/components/dashboard/tenant-invite-wizard";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DashboardLayout } from "./dashboard-layout";
import { useDashboardData } from "./dashboard-data-loader";
import type { OperationTask } from "./operations-section";
import { SectionRenderer } from "./section-renderer";
import type { DashboardProps } from "./types";

const AiAssistant = dynamic(
  () => import("@/components/dashboard/ai-assistant").then((module) => module.AiAssistant),
  { ssr: false }
);

function shouldHandleSectionHotkeys(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) {
    return true;
  }

  const tagName = element.tagName;
  if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) {
    return false;
  }

  return !element.isContentEditable;
}

function getWorstStripeHealthStatus(statuses: StripeHealthStatus[]): StripeHealthStatus {
  if (statuses.includes("missing")) {
    return "missing";
  }

  if (statuses.includes("restricted")) {
    return "restricted";
  }

  if (statuses.includes("active")) {
    return "active";
  }

  return null;
}

function PageHeader({
  title,
  pageCountLabel,
  onPrevious,
  onNext,
  actions
}: {
  title: string;
  pageCountLabel: string | null;
  onPrevious: () => void;
  onNext: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-bold text-foreground sm:text-[1.9rem]">{title}</h2>
        {pageCountLabel ? <p className="mt-1 text-sm text-muted-foreground">{pageCountLabel}</p> : null}
      </div>
      <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
        {actions}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={onPrevious}
          title="Previous section"
          aria-label="Previous section"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-full"
          onClick={onNext}
          title="Next section"
          aria-label="Next section"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const router = useRouter();
  const [isAnnouncementComposerOpen, setIsAnnouncementComposerOpen] = useState(false);
  const [initialOperationsTask, setInitialOperationsTask] = useState<OperationTask | undefined>(undefined);
  const [initialOperationsPropertyId, setInitialOperationsPropertyId] = useState<string | null>(null);
  const {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    closePropertyWizard,
    closeLeaseWizard,
    closeTenantInviteWizard,
    commandPaletteProps,
    displayDashboardData,
    financialOverviewData,
    filteredPortfolio,
    goToNextSection,
    goToPreviousSection,
    homeActionItems,
    isEmptyOwner,
    isManagerRole,
    isOwnerRole,
    isOwnerDailyOpsEnabled,
    isOwnerDailyOpsHomePage,
    isUnknownSection,
    isLeaseWizardOpen,
    isPropertyWizardOpen,
    isTenantInviteWizardOpen,
    layoutProps,
    llcSetupPrompt,
    occupancy,
    openPropertyWizard,
    ownerOnboarding,
    ownerDailyOpsPageCountLabel,
    ownerDailyOpsPageLabel,
    nextRentCollectionLabel,
    resolvedGamification,
    safePortfolio,
    sectionItems,
    sectionRendererProps,
    showOnboardingWizard
  } = useDashboardData(props);

  const displayName =
    props.nickname?.trim() ||
    props.fullName?.trim().split(/\s+/)[0] ||
    props.userEmail;
  const overdueCharges = displayDashboardData.charges.filter((charge) => charge.status === "late");
  const overdueAmountCents = overdueCharges.reduce((sum, charge) => sum + charge.amountCents, 0);
  const openTicketCount = sectionRendererProps.filteredTickets.filter(
    (ticket) => ticket.status === "open" || ticket.status === "in_progress"
  ).length;
  const urgentTicketCount = sectionRendererProps.filteredTickets.filter(
    (ticket) => ticket.priority === "high" || ticket.priority === "urgent"
  ).length;
  const onboardingDismissStorageKey = useMemo(
    () => `domus-owner-onboarding-dismissed:${props.userEmail}`,
    [props.userEmail]
  );
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const ownerSectionCountLabel = activeSectionIndex >= 0 && sectionItems.length > 0
    ? `${activeSectionIndex + 1} of ${sectionItems.length}`
    : null;
  const assistantAccountId = props.activeAccountId ?? props.ownershipAccounts?.[0]?.id ?? "";
  const ownerConnectHref = props.rentCollectionConnectHref ?? "/connect/onboard";
  const connectBannerConnected =
    isOwnerRole ? props.rentCollectionConnected === true : props.stripeConnected === true;
  const stripeHealthStatus = getWorstStripeHealthStatus(
    (props.ownershipAccounts ?? []).map((account) => account.stripeStatus ?? null)
  );
  const showOwnerDailyOpsShell = isOwnerRole && isOwnerDailyOpsEnabled;
  const showLlcSetupPrompt = Boolean(
    isOwnerRole &&
    isOwnerDailyOpsEnabled &&
    isOwnerDailyOpsHomePage &&
    !isUnknownSection &&
    llcSetupPrompt.shouldShow
  );
  const statusSummary = overdueCharges.length > 0
    ? `${overdueCharges.length} overdue charge${overdueCharges.length === 1 ? "" : "s"}`
    : urgentTicketCount > 0
      ? `${urgentTicketCount} urgent ticket${urgentTicketCount === 1 ? "" : "s"}`
      : openTicketCount > 0
        ? `${openTicketCount} open ticket${openTicketCount === 1 ? "" : "s"}`
        : "Everything looks good";
  const contentZoneLabel = ownerSectionCountLabel ?? activeWorkflowMeta?.label ?? "Workspace";
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

  useEffect(() => {
    if (!isOwnerRole) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!shouldHandleSectionHotkeys(event.target)) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousSection();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextSection();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [goToNextSection, goToPreviousSection, isOwnerRole]);

  const showOwnerOnboarding =
    isOwnerRole &&
    ownerOnboarding.shouldShow &&
    !showLlcSetupPrompt &&
    !isOnboardingDismissed &&
    !isUnknownSection &&
    (isOwnerDailyOpsEnabled ? isOwnerDailyOpsHomePage : activeSection === "overview");

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
      case "bank":
        window.location.href = ownerConnectHref;
        return;
      default:
        sectionRendererProps.openSection("overview");
    }
  };

  if (isEmptyOwner && showOwnerOnboarding) {
    return (
      <DashboardLayout
        {...layoutProps}
        mainClassName="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:ml-[260px]"
      >
        <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
        <div className="w-full max-w-3xl space-y-4">
          {connectBannerConnected === false ? (
            <ConnectBanner
              connected={false}
              role="owner"
              href={ownerConnectHref}
            />
          ) : null}
          {isOwnerRole ? <StripeHealthBanner status={stripeHealthStatus} /> : null}
          <WelcomeCard
            displayName={displayName}
            steps={ownerOnboarding.steps}
            onContinue={handleContinueOwnerOnboarding}
            onSkip={handleDismissOnboarding}
          />
        </div>
      </DashboardLayout>
    );
  }

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
          {isOwnerRole ? (
            <PropertyWizard
              open={isPropertyWizardOpen}
              accountId={props.activeAccountId}
              onOpenChange={(open) => {
                if (!open) {
                  closePropertyWizard();
                }
              }}
              onCreatePropertyWithSetup={props.onCreatePropertyWithSetup}
              onComplete={(propertyId) => {
                closePropertyWizard();
                if (propertyId) {
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
              onOpenChange={(open) => {
                if (!open) {
                  closeTenantInviteWizard();
                }
              }}
              onInviteTenant={props.onInviteTenant}
              onOpenSection={sectionRendererProps.openSection}
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
      <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 lg:px-8 lg:pb-8 lg:pt-8">
        {(isOwnerRole || isManagerRole) && connectBannerConnected === false ? (
          <ConnectBanner
            connected={false}
            role={isOwnerRole ? "owner" : "manager"}
            href={isOwnerRole ? ownerConnectHref : "/connect/onboard"}
          />
        ) : null}
        {isOwnerRole ? <StripeHealthBanner status={stripeHealthStatus} /> : null}
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

        {showOwnerDailyOpsShell ? (
          <>
            <CompactGreetingBar
              userName={displayName}
              role={props.data.profileRole}
              statusSummary={statusSummary}
              notifications={layoutProps.notifications}
              onDismissNotification={layoutProps.onDismissNotification}
              onClearAllNotifications={layoutProps.onClearAllNotifications}
              onSendBatchPaymentReminder={layoutProps.onSendBatchPaymentReminder}
              onWaiveCharge={layoutProps.onWaiveCharge}
              onMarkManagerPaymentPaid={layoutProps.onMarkManagerPaymentPaid}
              onOpenSettings={() => router.push("/settings")}
              onOpenNotifications={() => sectionRendererProps.openSection("notifications")}
            />
            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[24px] border border-border/50 bg-background/80 shadow-sm sm:rounded-[28px]">
              <PageHeader
                title={ownerDailyOpsPageLabel}
                pageCountLabel={ownerDailyOpsPageCountLabel}
                onPrevious={goToPreviousSection}
                onNext={goToNextSection}
                actions={
                  canSendAnnouncements ? (
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
              <div
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-3 pb-3 pt-3 sm:px-5 sm:pb-4 [-webkit-overflow-scrolling:touch]"
                onTouchStart={(event) => {
                  touchStartX.current = event.changedTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  if (touchStartX.current == null) {
                    return;
                  }
                  const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
                  if (Math.abs(delta) < 40) {
                    return;
                  }
                  if (delta > 0) {
                    goToPreviousSection();
                  } else {
                    goToNextSection();
                  }
                  touchStartX.current = null;
                }}
              >
                <section
                  id={isOwnerDailyOpsHomePage ? "daily-ops-home" : activeSection}
                  className="min-h-full"
                >
                  {showOwnerOnboarding ? (
                    <div className="flex h-full items-center justify-center">
                      <WelcomeCard
                        displayName={displayName}
                        steps={ownerOnboarding.steps}
                        onContinue={handleContinueOwnerOnboarding}
                        onSkip={handleDismissOnboarding}
                      />
                    </div>
                  ) : isOwnerDailyOpsHomePage ? (
                    <OwnerDailyOpsHome
                      actionItems={homeActionItems}
                      nextCollectionLabel={nextRentCollectionLabel}
                      onOpenSection={sectionRendererProps.openSection}
                      onSendBatchPaymentReminder={props.onSendBatchPaymentReminder}
                      onWaiveCharge={props.onWaiveCharge}
                      onMarkManagerPaymentPaid={props.onMarkManagerPaymentPaid}
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
                      onInitiatePlaidLink={props.onInitiatePlaidLink}
                      onCompletePlaidLink={props.onCompletePlaidLink}
                      onRefreshPlaidBalance={props.onRefreshPlaidBalance}
                      onDisconnectPlaid={props.onDisconnectPlaid}
                    />
                  ) : (
                    <div className="min-h-full">
                      <SectionRenderer
                        {...sectionRendererProps}
                        initialOperationsTask={initialOperationsTask}
                        initialOperationsPropertyId={initialOperationsPropertyId}
                        onInitialOperationsStateConsumed={() => {
                          setInitialOperationsTask(undefined);
                          setInitialOperationsPropertyId(null);
                        }}
                      />
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 shrink-0 space-y-3">
              {isOwnerRole ? (
                <DashboardHeader
                  role={props.data.profileRole}
                  kpis={displayDashboardData.kpis}
                  occupancy={occupancy}
                  propertyCount={filteredPortfolio.properties.length}
                  userEmail={props.userEmail}
                  nickname={props.nickname}
                  fullName={props.fullName}
                  greetingContent={
                    <ContextualGreeting
                      userName={displayName}
                      overdueChargeCount={overdueCharges.length}
                      overdueAmountCents={overdueAmountCents}
                      openTicketCount={openTicketCount}
                    />
                  }
                  gamificationSummary={
                    <GamificationSummary
                      totalXp={resolvedGamification.totalXp}
                      currentLevel={resolvedGamification.currentLevel}
                      streakCount={resolvedGamification.streakCount}
                      role={props.data.profileRole}
                      className="w-full"
                    />
                  }
                />
              ) : activeSection === "overview" ? (
                <DashboardHeader
                  role={props.data.profileRole}
                  kpis={displayDashboardData.kpis}
                  occupancy={occupancy}
                  propertyCount={filteredPortfolio.properties.length}
                  userEmail={props.userEmail}
                  nickname={props.nickname}
                  fullName={props.fullName}
                  gamificationSummary={
                    <GamificationSummary
                      totalXp={resolvedGamification.totalXp}
                      currentLevel={resolvedGamification.currentLevel}
                      streakCount={resolvedGamification.streakCount}
                      role={props.data.profileRole}
                      className="w-full"
                    />
                  }
                />
              ) : null}
              {(isOwnerRole || isManagerRole) && activeWorkflowMeta && !showOwnerOnboarding ? (
                <div className="domus-glass flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-foreground">{activeWorkflowMeta.label}</p>
                  <p className="text-sm text-muted-foreground">{activeWorkflowMeta.description}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[24px] border border-border/50 bg-background/80 shadow-sm sm:rounded-[28px]">
              <PageHeader
                title={contentZoneTitle}
                pageCountLabel={contentZoneLabel}
                onPrevious={goToPreviousSection}
                onNext={goToNextSection}
                actions={
                  canSendAnnouncements ? (
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

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-3 pb-3 pt-3 sm:px-5 sm:pb-4 [-webkit-overflow-scrolling:touch]">
                <section id={activeSection} className="min-h-full">
                  {showOwnerOnboarding ? (
                    <div className="flex h-full items-center justify-center">
                      <WelcomeCard
                        displayName={displayName}
                        steps={ownerOnboarding.steps}
                        onContinue={handleContinueOwnerOnboarding}
                        onSkip={handleDismissOnboarding}
                      />
                    </div>
                  ) : (
                    <div className="min-h-full">
                      <SectionRenderer
                        {...sectionRendererProps}
                        initialOperationsTask={initialOperationsTask}
                        initialOperationsPropertyId={initialOperationsPropertyId}
                        onInitialOperationsStateConsumed={() => {
                          setInitialOperationsTask(undefined);
                          setInitialOperationsPropertyId(null);
                        }}
                      />
                    </div>
                  )}
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
