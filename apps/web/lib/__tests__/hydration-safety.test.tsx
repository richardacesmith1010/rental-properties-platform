import React from "react";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionableNotification } from "@/components/dashboard/actionable-notification";
import { BankBalanceCard } from "@/components/dashboard/bank-balance-card";
import { DistributionApprovalCard } from "@/components/dashboard/distribution-approval-card";
import type { DistributionChangeRequestDTO } from "@/lib/distribution-approvals";
import type { NotificationDTO } from "@/lib/notifications";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn()
  })
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, "/__test_action__"] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

const noopAction = async () => ({ success: true as const });

const notification: NotificationDTO = {
  id: "notification-1",
  type: "late_rent",
  title: "Late rent detected",
  body: "Unit 1A has an overdue balance.",
  entityType: "rent_charge",
  entityId: "charge-1",
  readAt: null,
  createdAt: "2026-03-13T11:45:00.000Z"
};

const distributionRequest: DistributionChangeRequestDTO = {
  id: "request-1",
  ownershipAccountId: "account-1",
  status: "pending",
  requestedBy: "user-1",
  requestedByName: "Courtney",
  createdAt: "2026-03-13T18:45:00.000Z",
  currentConfig: {
    mode: "retain",
    members: []
  },
  proposedConfig: {
    mode: "split_equal",
    members: [
      {
        profileId: "user-1",
        pct: 50
      },
      {
        profileId: "user-2",
        pct: 50
      }
    ]
  },
  votesRequired: 2,
  votesReceived: 0,
  votes: [],
  resolvedAt: null
};

describe("hydration-safe dashboard timestamps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a deterministic SSR fallback for actionable notifications", () => {
    const html = renderToStaticMarkup(
      <ActionableNotification
        notification={notification}
        role="owner"
        onDismissNotification={noopAction}
      />
    );

    expect(html).toContain("Mar 13");
    expect(html).not.toContain("15m ago");
  });

  it("renders a deterministic SSR fallback for bank balances and then hydrates to relative text", async () => {
    const html = renderToStaticMarkup(
      <BankBalanceCard
        bankName="First Federal"
        bankMask="1234"
        balanceCents={482550}
        balanceUpdatedAt="2026-03-13T11:45:00.000Z"
        onRefreshBalance={noopAction}
        onDisconnect={noopAction}
        accountId="account-1"
      />
    );

    expect(html).toContain('title="Mar 13, 2026, 11:45 AM"');
    expect(html).toContain(">Mar 13, 2026, 11:45 AM</span>");

    render(
      <BankBalanceCard
        bankName="First Federal"
        bankMask="1234"
        balanceCents={482550}
        balanceUpdatedAt="2026-03-13T11:45:00.000Z"
        onRefreshBalance={noopAction}
        onDisconnect={noopAction}
        accountId="account-1"
      />
    );

    expect(screen.getByText("15 minutes ago")).toBeInTheDocument();
  });

  it("renders UTC-pinned approval timestamps in SSR markup", () => {
    const html = renderToStaticMarkup(
      <DistributionApprovalCard
        request={distributionRequest}
        currentUserId="user-2"
        onVote={noopAction}
      />
    );

    expect(html).toContain("Mar 13, 6:45 PM");
  });
});
