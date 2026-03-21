"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { ConnectBanner } from "@/components/dashboard/connect-banner";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { ContextualGreeting } from "@/components/dashboard/contextual-greeting";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { OwnerDailyOpsHome } from "@/components/dashboard/owner-daily-ops-home";
import { PropertyWizard } from "@/components/dashboard/property-wizard";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DashboardLayout } from "./dashboard-layout";
import { useDashboardData } from "./dashboard-data-loader";
import { SectionRenderer } from "./section-renderer";
import type { DashboardProps } from "./types";

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

export function Dashboard(props: DashboardProps) {
  const {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    closePropertyWizard,
    commandPaletteProps,
    displayDashboardData,
    filteredPortfolio,
    goToNextSection,
    goToPreviousSection,
    isEmptyOwner,
    isManagerRole,
    isOwnerRole,
    isOwnerDailyOpsEnabled,
    isOwnerDailyOpsHomePage,
    isPropertyWizardOpen,
    layoutProps,
    occupancy,
    openPropertyWizard,
    ownerOnboarding,
    ownerDailyOpsPageCountLabel,
    ownerDailyOpsPageLabel,
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
  const onboardingDismissStorageKey = useMemo(
    () => `domus-owner-onboarding-dismissed:${props.userEmail}`,
    [props.userEmail]
  );
  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const ownerSectionCountLabel =
    activeSectionIndex >= 0 && sectionItems.length > 0 ? `${activeSectionIndex + 1} of ${sectionItems.length}` : null;
  const contentZoneLabel =
    isOwnerDailyOpsEnabled && ownerDailyOpsPageCountLabel
      ? ownerDailyOpsPageCountLabel
      : ownerSectionCountLabel ?? activeWorkflowMeta?.label ?? "Workspace";
  const contentZoneTitle =
    isOwnerDailyOpsEnabled && isOwnerDailyOpsHomePage
      ? "Home"
      : isOwnerDailyOpsEnabled
        ? ownerDailyOpsPageLabel
        : activeSectionLabel;

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
    !isOnboardingDismissed &&
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
        window.location.href = "/connect/onboard";
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
          {props.stripeConnected === false ? <ConnectBanner connected={false} role="owner" /> : null}
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
      mainClassName="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:ml-[260px]"
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
              activeAccountId={props.activeAccountId}
              managers={props.managerPaymentManagers ?? []}
              onOpenChange={(open) => {
                if (!open) {
                  closePropertyWizard();
                }
              }}
              onCreateProperty={props.onCreateProperty}
              onCreateUnit={props.onCreateUnit}
              onInviteManager={props.onInviteManager}
              onOpenSection={sectionRendererProps.openSection}
            />
          ) : null}
        </>
      }
    >
      <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-6 lg:px-8 lg:pb-8 lg:pt-8">
        <div className="shrink-0 space-y-4">
          {(isOwnerRole || isManagerRole) && props.stripeConnected === false ? (
            <ConnectBanner connected={false} role={isOwnerRole ? "owner" : "manager"} />
          ) : null}
          {props.generatedMessage ? (
            <Alert variant="success" className="rounded-xl px-4 py-3">
              {props.generatedMessage}
            </Alert>
          ) : null}
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

        <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/50 bg-background/80 shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {contentZoneLabel}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">{contentZoneTitle}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={goToPreviousSection}
                title="Previous section"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={goToNextSection}
                title="Next section"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4 sm:px-5"
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              if (!isOwnerRole || touchStartX.current == null) {
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
              id={isOwnerDailyOpsEnabled && isOwnerDailyOpsHomePage ? "daily-ops-home" : activeSection}
              className="h-full overflow-hidden"
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
              ) : isOwnerDailyOpsEnabled && isOwnerDailyOpsHomePage ? (
                <OwnerDailyOpsHome onOpenOverview={goToNextSection} />
              ) : (
                <div className={isOwnerRole ? "h-full overflow-hidden" : "h-full overflow-auto pr-1"}>
                  <SectionRenderer {...sectionRendererProps} />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
