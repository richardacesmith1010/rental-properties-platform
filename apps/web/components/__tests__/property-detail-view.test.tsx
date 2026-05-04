import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PropertyDetailView } from "@/components/dashboard/property-detail-view";

vi.mock("@/components/dashboard/ticket-status-control", () => ({
  TicketStatusControl: () => <div>Ticket Status Control</div>
}));
vi.mock("@/components/dashboard/maintenance-tracker", () => ({
  MaintenanceTracker: () => <div>Maintenance Tracker</div>
}));
vi.mock("@/components/dashboard/maintenance-comment-thread", () => ({
  MaintenanceCommentThread: () => <div>Maintenance Comment Thread</div>
}));
vi.mock("@/components/dashboard/tenant-activity-timeline", () => ({
  TenantActivityTimeline: ({ tenantName }: { tenantName: string }) => (
    <div>Activity Timeline for {tenantName}</div>
  )
}));
vi.mock("@/components/dashboard/compose-message-modal", () => ({
  ComposeMessageModal: ({ recipientName }: { recipientName: string }) => (
    <div>Compose Message for {recipientName}</div>
  )
}));

describe("PropertyDetailView", () => {
  const data = {
    property: {
      id: "property-1",
      name: "Atlas House",
      addressLine1: "123 Forum Ave",
      city: "Denver",
      state: "CO",
      postalCode: "80202",
      managementFeeCents: 0,
      unitCount: 2,
      ownerAccountId: "account-1",
      ownerAccountName: "Atlas LLC",
      active: true
    },
    units: [
      {
        id: "unit-1",
        propertyId: "property-1",
        propertyName: "Atlas House",
        unitNumber: "A",
        bedrooms: 2,
        bathrooms: 1,
        monthlyRentCents: 150000,
        squareFeet: null,
        occupied: true,
        active: true
      }
    ],
    leases: [
      {
        id: "lease-1",
        unitId: "unit-1",
        propertyId: "property-1",
        propertyName: "Atlas House",
        tenantProfileId: "tenant-1",
        unitLabel: "Atlas House • A",
        tenantName: "Ava Tenant",
        tenantEmail: "ava@example.com",
        tenantPhone: "555-0001",
        monthlyRentCents: 150000,
        depositCents: 150000,
        dueDayOfMonth: 1,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        leaseStatus: "active" as const,
        gracePeriodDays: 5,
        lateFeeCents: 0,
        notes: null,
        active: true
      }
    ],
    tenants: [
      {
        id: "tenant-1",
        email: "ava@example.com",
        fullName: "Ava Tenant",
        phone: "555-0001",
        propertyIds: ["property-1"]
      }
    ],
    charges: [
      {
        id: "charge-pending",
        leaseId: "lease-1",
        propertyId: "property-1",
        tenantProfileId: "tenant-1",
        tenantName: "Ava Tenant",
        unitNumber: "A",
        category: "rent" as const,
        amountCents: 150000,
        dueDate: "2025-06-01",
        status: "pending" as const,
        paymentDate: null
      },
      {
        id: "charge-paid",
        leaseId: "lease-1",
        propertyId: "property-1",
        tenantProfileId: "tenant-1",
        tenantName: "Ava Tenant",
        unitNumber: "A",
        category: "late_fee" as const,
        amountCents: 10000,
        dueDate: "2025-05-01",
        status: "paid" as const,
        paymentDate: "2025-05-02"
      }
    ],
    payments: [],
    maintenance: [
      {
        id: "ticket-1",
        propertyId: "property-1",
        propertyName: "Atlas House",
        unitNumber: "A",
        title: "Leaky sink",
        description: "Kitchen sink leak",
        status: "open" as const,
        priority: "high" as const,
        actualCostCents: null,
        vendorName: null,
        assignmentStatus: null,
        photoCount: 0,
        latestPhotoId: null,
        photos: [],
        createdAt: "2025-06-01T12:00:00.000Z",
        resolvedAt: null,
        tenantEmail: null,
        commentCount: 0,
        comments: [],
        timeline: []
      }
    ],
    documents: {
      files: [
        {
          id: "file-1",
          propertyId: "property-1",
          propertyLabel: "Atlas House",
          fileName: "Lease.pdf",
          fileType: "pdf",
          category: "lease_agreement" as const,
          visibility: "all" as const,
          description: "Signed lease",
          createdAt: "2025-05-01T12:00:00.000Z",
          uploaderName: "Courtney"
        },
        {
          id: "file-2",
          propertyId: "property-1",
          propertyLabel: "Atlas House",
          fileName: "Insurance.pdf",
          fileType: "pdf",
          category: "insurance" as const,
          visibility: "owner_manager" as const,
          description: null,
          createdAt: "2025-05-03T12:00:00.000Z",
          uploaderName: "Courtney"
        }
      ],
      propertyFilesEnabled: true,
      propertyFilesWarning: null
    },
    activity: [
      {
        id: "activity-1",
        tenantProfileId: "tenant-1",
        tenantName: "Ava Tenant",
        propertyId: "property-1",
        unitId: "unit-1",
        unitNumber: "A",
        leaseId: "lease-1",
        activityType: "note" as const,
        title: "Noise warning",
        description: "Late-night music",
        createdAt: "2025-06-05T12:00:00.000Z",
        createdBy: "owner-1",
        authorName: "Courtney"
      }
    ]
  };

  it("renders overview details and switches tabs", () => {
    render(
      <PropertyDetailView
        data={data}
        role="owner"
        onCreateTenantActivity={async () => ({ success: true })}
        onGetTenantActivityLog={async () => []}
        onSendMessageToTenant={async () => ({ success: true })}
        onAddTicketComment={async () => ({ success: true })}
        onUpdateTicketStatus={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("Property Details")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Atlas House" })
    ).toBeInTheDocument();
    expect(screen.getByText("Recent activity")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Payments/i }));
    expect(screen.getByText("Late Fee")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.getByText("Late Fee")).toBeInTheDocument();
    expect(screen.queryByText("Rent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Documents/i }));
    expect(screen.getByText("Tenant-visible documents")).toBeInTheDocument();
    expect(screen.getByText("Owner & Manager only")).toBeInTheDocument();
  });

  it("opens tenant activity and the message composer from the tenants tab", () => {
    render(
      <PropertyDetailView
        data={data}
        role="manager"
        onCreateTenantActivity={async () => ({ success: true })}
        onGetTenantActivityLog={async () => []}
        onSendMessageToTenant={async () => ({ success: true })}
        onAddTicketComment={async () => ({ success: true })}
        onUpdateTicketStatus={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Tenants/i }));
    fireEvent.click(screen.getByRole("button", { name: "View Activity" }));
    expect(
      screen.getByText("Activity Timeline for Ava Tenant")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Send Message/i }));
    expect(
      screen.getByText("Compose Message for Ava Tenant")
    ).toBeInTheDocument();
  });
});
