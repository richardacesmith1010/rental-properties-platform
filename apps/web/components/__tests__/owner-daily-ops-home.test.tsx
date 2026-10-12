import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OwnerDailyOpsHome, groupLateRent } from "@/components/dashboard/owner-daily-ops-home";
import { OwnerSectionCacheContext, type useOwnerSectionCache } from "@/components/dashboard/owner-section-cache";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return { ...actual, useFormState: () => [null, vi.fn()] as const, useFormStatus: () => ({ pending: false }) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const summary = {
  lateCharges: [{ id: "charge-1", leaseId: "lease-1", propertyId: "property-1", dueDate: "2026-10-01",
    amountCents: 120000, status: "late" as const, propertyName: "Forum House", unitNumber: "1A",
    tenantName: "Maya Bell", category: "rent" as const }],
  openRepairCount: 2, newMessageCount: 1, collectedCents: 300000, dueCents: 500000,
  homeCount: 2, rentedHomeCount: 1, nextDueDate: "2026-11-01", nextDueAmountCents: 240000,
  nextDueTenantCount: 2
};
const financialOverview = { ytdIncomeCents: 300000, ytdExpensesCents: 75000 };

describe("manager Home regression", () => {
  it("keeps bank, needs, rent, homes, and next due sections in the old order and text", () => {
    const { container } = render(<OwnerDailyOpsHome isManagerView
      bankState={{ status: "not_started", href: "/connect/onboard" }} summary={summary}
      onOpenSection={vi.fn()} financialOverview={financialOverview} />);
    const text = container.textContent ?? "";
    for (const copy of ["Connect your bank to get your fees", "Needs you today", "Maya Bell owes $1,200",
      "2 open repairs", "1 conversation", "Rent this month", "$3,000 of $5,000", "Homes you manage",
      "1 of 2 rented", "Next rent due", "$2,400 from 2 tenants"]) expect(text).toContain(copy);
    expect(text.indexOf("Needs you today")).toBeLessThan(text.indexOf("Rent this month"));
    expect(text.indexOf("Rent this month")).toBeLessThan(text.indexOf("Homes you manage"));
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument();
  });
  it("keeps reminder and outside-payment actions working", async () => {
    const reminder = vi.fn(async () => ({ success: true as const }));
    render(<OwnerDailyOpsHome isManagerView bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} notificationsAreOn onOpenSection={vi.fn()} financialOverview={financialOverview}
      onSendBatchPaymentReminder={reminder} />);
    fireEvent.click(screen.getByRole("button", { name: "Send reminder" }));
    await waitFor(() => expect(reminder).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Mark as paid" }));
    expect(screen.getByRole("button", { name: "Save Payment" })).toBeInTheDocument();
  });
});

describe("owner Home replacement", () => {
  it("removes old owner boxes and keeps the wallet sections", () => {
    render(<OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
      summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview}
      portfolio={{ properties: [], units: [], leases: [], tenants: [] }} />);
    expect(screen.getByText("2026 so far")).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    for (const old of ["This month", "Rent this month", "Next rent due", "More numbers", "Sort your bank file"])
      expect(screen.queryByText(old)).not.toBeInTheDocument();
  });
  it("groups late months for the retained manager reminder", () => {
    expect(groupLateRent([{ ...summary.lateCharges[0], id: "a", dueDate: "2026-08-01" },
      { ...summary.lateCharges[0], id: "b", dueDate: "2026-09-01" }]))
      .toMatchObject([{ totalCents: 240000, monthCount: 2, oldestCharge: { id: "a" } }]);
  });
  it("loads deferred Home bundles before showing the YTD net", () => {
    const loadHome = vi.fn();
    const cache = { hasBundles: () => false, homeError: false, loadHome } as unknown as
      ReturnType<typeof useOwnerSectionCache>;
    render(<OwnerSectionCacheContext.Provider value={cache}>
      <OwnerDailyOpsHome bankState={{ status: "connected", href: "/connect/onboard" }}
        summary={summary} onOpenSection={vi.fn()} financialOverview={financialOverview} />
    </OwnerSectionCacheContext.Provider>);
    expect(loadHome).toHaveBeenCalledOnce();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("$2,250")).not.toBeInTheDocument();
  });
});
