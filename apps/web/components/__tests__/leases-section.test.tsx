import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeasesSection } from "@/components/dashboard/leases-section";
import { formatCurrency, formatDate } from "@/lib/format";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  })
}));

describe("LeasesSection", () => {
  const activeLease = {
    id: "lease-1",
    unitId: "unit-1",
    propertyId: "property-1",
    tenantProfileId: "tenant-1",
    unitLabel: "Atlas House • 1A",
    tenantName: "Taylor Tenant",
    tenantEmail: "tenant@example.com",
    tenantPhone: "555-111-2222",
    monthlyRentCents: 180000,
    depositCents: 90000,
    dueDayOfMonth: 1,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    leaseStatus: "active" as const,
    gracePeriodDays: 5,
    lateFeeCents: 5000,
    notes: "No smoking.",
    active: true
  };

  const rentIncreaseHistory = [
    {
      id: "increase-1",
      leaseId: "lease-1",
      propertyId: "property-1",
      propertyName: "Atlas House",
      unitId: "unit-1",
      unitNumber: "1A",
      tenantName: "Taylor Tenant",
      previousRentCents: 170000,
      newRentCents: 180000,
      changePercent: 5.9,
      effectiveDate: "2026-01-01",
      reason: "Annual renewal",
      createdAt: "2025-12-01T00:00:00.000Z"
    }
  ];

  it("renders the lease list when leases exist", () => {
    render(<LeasesSection leases={[activeLease]} />);

    expect(screen.getByText("Atlas House • 1A")).toBeInTheDocument();
  });

  it("shows the new lease button when lease management is enabled", () => {
    const onOpenLeaseWizard = vi.fn();

    render(
      <LeasesSection
        leases={[activeLease]}
        showControls
        onUpdateLease={async () => null}
        onDeleteLease={async () => null}
        onRenewLease={async () => null}
        onTerminateLease={async () => null}
        onOpenLeaseWizard={onOpenLeaseWizard}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "New Lease" }));
    expect(onOpenLeaseWizard).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no leases exist", () => {
    render(<LeasesSection leases={[]} />);

    expect(screen.getByText("No leases yet")).toBeInTheDocument();
    expect(screen.getByText("Create a lease to start tracking rent and tenant information.")).toBeInTheDocument();
  });

  it("shows the lease dates", () => {
    render(<LeasesSection leases={[activeLease]} />);

    expect(
      screen.getByText(
        `${formatDate(activeLease.startDate)} to ${formatDate(activeLease.endDate)}`
      )
    ).toBeInTheDocument();
  });

  it("shows the monthly rent amount", () => {
    render(<LeasesSection leases={[activeLease]} />);

    expect(screen.getByText(formatCurrency(activeLease.monthlyRentCents))).toBeInTheDocument();
  });

  it("shows active, expired, and terminated status badges", () => {
    const expiredLease = { ...activeLease, id: "lease-2", leaseStatus: "expired" as const };
    const terminatedLease = { ...activeLease, id: "lease-3", leaseStatus: "terminated" as const };

    render(<LeasesSection leases={[activeLease, expiredLease, terminatedLease]} />);

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Terminated")).toBeInTheDocument();
  });

  it("shows the tenant email", () => {
    render(<LeasesSection leases={[activeLease]} />);

    expect(screen.getByText("Taylor Tenant")).toBeInTheDocument();
    expect(screen.getByText("tenant@example.com • 555-111-2222")).toBeInTheDocument();
  });

  it("renders renew and terminate controls when management is enabled", () => {
    render(
      <LeasesSection
        leases={[activeLease]}
        showControls
        onUpdateLease={async () => null}
        onDeleteLease={async () => null}
        onRenewLease={async () => null}
        onTerminateLease={async () => null}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));

    expect(screen.getByRole("button", { name: "Renew" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminate" })).toBeInTheDocument();
  });

  it("renders rent increase history when entries exist", () => {
    render(<LeasesSection leases={[activeLease]} rentIncreaseHistory={rentIncreaseHistory} />);

    expect(screen.getByText("Rent Increase History")).toBeInTheDocument();
    expect(screen.getByText(/Taylor Tenant • Atlas House • 1A/)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${formatCurrency(rentIncreaseHistory[0].previousRentCents)} → ${formatCurrency(
          rentIncreaseHistory[0].newRentCents
        )}`
      )
    ).toBeInTheDocument();
  });

  it("shows edit buttons for lease and tenant records when controls are enabled", () => {
    render(
      <LeasesSection
        leases={[activeLease]}
        showControls
        onUpdateLease={async () => ({ success: true, message: "Lease updated." })}
        onUpdateTenantDisplayInfo={async () => ({ success: true, message: "Tenant updated." })}
      />
    );

    expect(screen.getByRole("button", { name: "Edit lease for Atlas House • 1A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Taylor Tenant" })).toBeInTheDocument();
  });
});
