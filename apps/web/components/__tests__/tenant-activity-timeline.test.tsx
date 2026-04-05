import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantActivityTimeline } from "@/components/dashboard/tenant-activity-timeline";
import type { ActionState } from "@/app/actions";

const mockFormAction = vi.fn();
let mockFormState: ActionState = null;

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [mockFormState, mockFormAction] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

describe("TenantActivityTimeline", () => {
  beforeEach(() => {
    mockFormState = null;
    mockFormAction.mockReset();
  });

  it("shows the empty state after loading with no entries", async () => {
    const onLoadEntries = vi.fn().mockResolvedValue([]);

    render(
      <TenantActivityTimeline
        tenantProfileId="tenant-1"
        propertyId="property-1"
        tenantName="Taylor Tenant"
        onLoadEntries={onLoadEntries}
        onCreateActivity={async () => null}
      />
    );

    expect(await screen.findByText("No activity recorded yet.")).toBeInTheDocument();
    expect(onLoadEntries).toHaveBeenCalledWith("tenant-1", "property-1");
  });

  it("renders timeline entries with badges, details, and author names", async () => {
    const onLoadEntries = vi.fn().mockResolvedValue([
      {
        id: "entry-1",
        tenantProfileId: "tenant-1",
        propertyId: "property-1",
        unitId: "unit-1",
        leaseId: "lease-1",
        activityType: "warning" as const,
        title: "Late payment notice",
        description: "Sent a formal warning.",
        createdAt: "2026-03-28T14:30:00.000Z",
        createdBy: "author-1",
        authorName: "Ace Manager"
      }
    ]);

    render(
      <TenantActivityTimeline
        tenantProfileId="tenant-1"
        propertyId="property-1"
        tenantName="Taylor Tenant"
        onLoadEntries={onLoadEntries}
        onCreateActivity={async () => null}
      />
    );

    expect(await screen.findByText("Late payment notice")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Sent a formal warning.")).toBeInTheDocument();
    expect(screen.getByText("Logged by Ace Manager")).toBeInTheDocument();
  });

  it("opens the add-entry form and reloads entries after a successful save", async () => {
    const onLoadEntries = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "entry-2",
          tenantProfileId: "tenant-1",
          propertyId: "property-1",
          unitId: "unit-1",
          leaseId: "lease-1",
          activityType: "note" as const,
          title: "Move-in inspection complete",
          description: "All rooms inspected.",
          createdAt: "2026-03-15T10:15:00.000Z",
          createdBy: "author-1",
          authorName: "Ace Manager"
        }
      ]);

    const { rerender } = render(
      <TenantActivityTimeline
        tenantProfileId="tenant-1"
        propertyId="property-1"
        unitId="unit-1"
        leaseId="lease-1"
        tenantName="Taylor Tenant"
        onLoadEntries={onLoadEntries}
        onCreateActivity={async () => ({ success: true, message: "Activity saved." })}
      />
    );

    await screen.findByText("No activity recorded yet.");

    fireEvent.click(screen.getByRole("button", { name: "Add Entry" }));

    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Details")).toBeInTheDocument();

    mockFormState = { success: true, message: "Activity saved." };

    rerender(
      <TenantActivityTimeline
        tenantProfileId="tenant-1"
        propertyId="property-1"
        unitId="unit-1"
        leaseId="lease-1"
        tenantName="Taylor Tenant"
        onLoadEntries={onLoadEntries}
        onCreateActivity={async () => ({ success: true, message: "Activity saved." })}
      />
    );

    await waitFor(() => {
      expect(onLoadEntries).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Move-in inspection complete")).toBeInTheDocument();
  });
});
