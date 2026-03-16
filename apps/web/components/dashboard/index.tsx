"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AchievementChecker } from "@/components/gamification/achievement-checker";
import { GamificationSummary } from "@/components/gamification/gamification-summary";
import { ConnectBanner } from "@/components/dashboard/connect-banner";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DashboardLayout } from "./dashboard-layout";
import { useDashboardData } from "./dashboard-data-loader";
import { SectionRenderer } from "./section-renderer";
import type { DashboardProps } from "./types";

export function Dashboard(props: DashboardProps) {
  const {
    activeSection,
    activeSectionIndex,
    activeSectionLabel,
    activeWorkflowMeta,
    displayDashboardData,
    filteredPortfolio,
    goToNextSection,
    goToPreviousSection,
    isEmptyOwner,
    isOwnerRole,
    isManagerRole,
    layoutProps,
    occupancy,
    ownerWorkflowMode,
    resolvedGamification,
    safePortfolio,
    sectionItems,
    sectionRendererProps,
    showOnboardingWizard
  } = useDashboardData(props);

  if (isEmptyOwner) {
    return (
      <DashboardLayout
        {...layoutProps}
        mainClassName="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:ml-[260px]"
      >
        <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
        <div className="w-full max-w-md space-y-4">
          {props.stripeConnected === false ? <ConnectBanner connected={false} role="owner" /> : null}
          <WelcomeCard
            fullName={props.fullName}
            nickname={props.nickname}
            role={props.data.profileRole}
            stripeConnected={props.stripeConnected === true}
            hasProperty={safePortfolio.properties.length > 0}
            hasUnit={safePortfolio.units.length > 0}
            hasLease={safePortfolio.leases.length > 0}
            onAddProperty={() => {
              window.location.href = `/owner?mode=new_property&section=operations${
                props.activeAccountId ? `&account=${encodeURIComponent(props.activeAccountId)}` : ""
              }`;
            }}
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      {...layoutProps}
      mainClassName="relative flex-1 lg:ml-[260px]"
      afterMain={
        showOnboardingWizard && props.onInviteTenant ? (
          <OnboardingWizard
            propertyId={safePortfolio.properties[0].id}
            propertyName={safePortfolio.properties[0].name}
            stripeConnected={props.stripeConnected === true}
            unitCount={safePortfolio.units.length}
            onCreateUnit={props.onCreateUnit}
            onCreateLease={props.onCreateLease}
            onInviteTenant={props.onInviteTenant}
          />
        ) : null
      }
    >
      <AchievementChecker currentLevel={resolvedGamification.currentLevel} />
      {activeSection === "overview" ? (
        <div className="px-6 pt-6 lg:px-8 lg:pt-8" id="overview">
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
        </div>
      ) : null}
      <div className="space-y-6 px-6 pb-8 pt-6 lg:px-8">
        {props.generatedMessage ? (
          <Alert variant="success" className="rounded-xl px-4 py-3">
            {props.generatedMessage}
          </Alert>
        ) : null}
        {(isOwnerRole || isManagerRole) && props.stripeConnected === false ? (
          <ConnectBanner connected={false} role={isOwnerRole ? "owner" : "manager"} />
        ) : null}
        {(isOwnerRole || isManagerRole) && activeWorkflowMeta && activeSection === "overview" ? (
          <div className="domus-glass flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-zinc-900">{activeWorkflowMeta.label}</p>
            <p className="text-sm text-zinc-500">{activeWorkflowMeta.description}</p>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold domus-heading">{activeSectionLabel}</h2>
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
          <SectionRenderer {...sectionRendererProps} />
        </section>
      </div>
    </DashboardLayout>
  );
}
