import { useMemo } from "react";
import { computeActionItems, getNextRentCollectionLabel } from "@/lib/action-items";
import type { OnboardingChecklistStep } from "@/components/dashboard/onboarding-checklist";
import type { DashboardProps } from "./types";
import type { DashboardCollectionState, DashboardKpiState } from "./dashboard-kpi-loader";

export interface OwnerOnboardingState {
  steps: OnboardingChecklistStep[];
  nextStepId: OnboardingChecklistStep["id"] | null;
  completedCount: number;
  totalSteps: number;
  shouldShow: boolean;
}

export function useDashboardHomeState(
  props: DashboardProps,
  collections: DashboardCollectionState,
  kpis: DashboardKpiState
) {
  const {
    activeOwnershipAccount,
    safeManagerPayments,
    safeOwnershipAccounts,
    safePortfolio
  } = collections;
  const { displayDashboardData, filteredPortfolio, filteredTickets, isOwnerRole } = kpis;

  const ownerOnboarding = useMemo<OwnerOnboardingState>(() => {
    if (!isOwnerRole) {
      return {
        steps: [],
        nextStepId: null,
        completedCount: 0,
        totalSteps: 0,
        shouldShow: false
      };
    }

    const steps: OnboardingChecklistStep[] = [
      {
        id: "profile",
        label: "Profile completed",
        description: "Your name and contact info are ready to use throughout Domus.",
        completed: true
      },
      {
        id: "account",
        label: "Account set up",
        description: "Your ownership account is ready for properties, members, and payouts.",
        completed: Boolean(props.activeAccountId ?? safeOwnershipAccounts[0]?.id)
      },
      {
        id: "property",
        label: "Add a property",
        description: "Enter your first property address and core details.",
        completed: safePortfolio.properties.length > 0
      },
      {
        id: "unit",
        label: "Add a unit",
        description: "Create at least one rentable unit inside your property.",
        completed: safePortfolio.units.length > 0
      },
      {
        id: "lease",
        label: "Create a lease",
        description: "Set rent, dates, and tenant details so charges can start flowing.",
        completed: safePortfolio.leases.length > 0
      },
      {
        id: "bank",
        label: "Connect bank account",
        description: "Link your payout and rent-collection account to finish setup.",
        completed: props.stripeConnected === true
      }
    ];

    const completedCount = steps.filter((step) => step.completed).length;
    const nextStepId = steps.find((step) => !step.completed)?.id ?? null;

    return {
      steps,
      nextStepId,
      completedCount,
      totalSteps: steps.length,
      shouldShow: nextStepId !== null
    };
  }, [
    isOwnerRole,
    props.activeAccountId,
    props.stripeConnected,
    safeOwnershipAccounts,
    safePortfolio.leases.length,
    safePortfolio.properties.length,
    safePortfolio.units.length
  ]);

  const activeOwnershipMembers = useMemo(
    () => (props.ownershipMembers ?? []).filter((member) => member.active),
    [props.ownershipMembers]
  );

  const llcSetupPrompt = useMemo(
    () => ({
      shouldShow:
        isOwnerRole &&
        activeOwnershipAccount?.accountType === "llc" &&
        activeOwnershipMembers.length <= 1 &&
        safePortfolio.properties.length === 0,
      accountName: activeOwnershipAccount?.displayName ?? "Your LLC",
      memberCount: activeOwnershipMembers.length,
      propertyCount: safePortfolio.properties.length
    }),
    [
      activeOwnershipAccount?.accountType,
      activeOwnershipAccount?.displayName,
      activeOwnershipMembers.length,
      isOwnerRole,
      safePortfolio.properties.length
    ]
  );

  const homeActionItems = useMemo(
    () =>
      isOwnerRole
        ? computeActionItems({
            charges: displayDashboardData.charges,
            tickets: filteredTickets,
            managerPayments: safeManagerPayments,
            leases: filteredPortfolio.leases,
            pendingInvitations: props.pendingLlcInvitations ?? [],
            newFeedbackCount: props.newFeedbackCount ?? 0
          })
        : [],
    [
      displayDashboardData.charges,
      filteredPortfolio.leases,
      filteredTickets,
      isOwnerRole,
      props.newFeedbackCount,
      props.pendingLlcInvitations,
      safeManagerPayments
    ]
  );

  const nextRentCollectionLabel = useMemo(
    () =>
      isOwnerRole
        ? getNextRentCollectionLabel({
            charges: displayDashboardData.charges,
            leases: filteredPortfolio.leases
          })
        : null,
    [displayDashboardData.charges, filteredPortfolio.leases, isOwnerRole]
  );

  return {
    ownerOnboarding,
    llcSetupPrompt,
    homeActionItems,
    nextRentCollectionLabel
  };
}

export type DashboardHomeState = ReturnType<typeof useDashboardHomeState>;
