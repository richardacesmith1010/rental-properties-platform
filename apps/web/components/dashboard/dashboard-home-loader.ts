import { useMemo } from "react";
import { getNextRentCollectionLabel } from "@/lib/action-items";
import { isCollectedOutsideDomus } from "@/lib/lease-collection";
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

  const ownerHomeSummary = useMemo(() => {
    const charges = displayDashboardData.charges;
    const rentCharges = charges.filter((charge) => charge.category === "rent");
    const lateCharges = rentCharges.filter(
      (charge) => charge.status === "late" && !isCollectedOutsideDomus(charge)
    );
    const openRepairCount = filteredTickets.filter(
      (ticket) => ticket.status === "open" || ticket.status === "in_progress"
    ).length;
    const dueCents =
      displayDashboardData.kpis.collectedRentCents +
      displayDashboardData.kpis.pendingRentCents +
      displayDashboardData.kpis.overdueRentCents;
    const rentedPropertyIds = new Set(
      safePortfolio.units.filter((unit) => unit.occupied).map((unit) => unit.propertyId)
    );
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const nextDueCharges = rentCharges
      .filter(
        (charge) =>
          charge.status === "pending" &&
          charge.dueDate >= todayIso &&
          !isCollectedOutsideDomus(charge)
      )
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
    const nextDueDate = nextDueCharges[0]?.dueDate ?? null;
    const chargesOnNextDate = nextDueDate
      ? nextDueCharges.filter((charge) => charge.dueDate === nextDueDate)
      : [];

    return {
      lateCharges,
      openRepairCount,
      newMessageCount: props.inboxThreads?.length ?? 0,
      collectedCents: displayDashboardData.kpis.collectedRentCents,
      dueCents,
      homeCount: safePortfolio.properties.length,
      rentedHomeCount: rentedPropertyIds.size,
      nextDueDate,
      nextDueAmountCents: chargesOnNextDate.reduce(
        (sum, charge) => sum + charge.amountCents,
        0
      ),
      nextDueTenantCount: new Set(chargesOnNextDate.map((charge) => charge.leaseId)).size
    };
  }, [displayDashboardData, filteredTickets, props.inboxThreads, safePortfolio]);

  return {
    ownerOnboarding,
    llcSetupPrompt,
    homeActionItems: ownerHomeSummary,
    nextRentCollectionLabel,
  };
}

export type DashboardHomeState = ReturnType<typeof useDashboardHomeState>;
