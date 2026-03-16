import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MaintenanceSection } from "@/components/dashboard/maintenance-section";
import type { MaintenanceTicket } from "@/lib/maintenance";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

vi.mock("@/components/dashboard/ticket-status-control", () => ({
  TicketStatusControl: ({ ticketId }: { ticketId: string }) => <div data-testid={`status-control-${ticketId}`}>status control</div>
}));

vi.mock("@/components/dashboard/ticket-vendor-control", () => ({
  TicketVendorControl: ({ ticketId }: { ticketId: string }) => <div data-testid={`vendor-control-${ticketId}`}>vendor control</div>
}));

vi.mock("@/components/dashboard/ticket-photo-upload", () => ({
  TicketPhotoUpload: ({ ticketId }: { ticketId: string }) => <div data-testid={`photo-upload-${ticketId}`}>photo upload</div>
}));

vi.mock("@/components/dashboard/maintenance-comment-thread", () => ({
  MaintenanceCommentThread: ({ ticketId }: { ticketId: string }) => <div data-testid={`comment-thread-${ticketId}`}>comment thread</div>
}));

vi.mock("@/components/dashboard/maintenance-tracker", () => ({
  MaintenanceTracker: () => <div data-testid="maintenance-tracker">tracker</div>
}));

describe("MaintenanceSection", () => {
  const ticket: MaintenanceTicket = {
    id: "ticket-1",
    propertyId: "property-1",
    propertyName: "Atlas House",
    unitNumber: "1A",
    title: "Leaking sink",
    description: "Kitchen sink is leaking under the cabinet.",
    status: "open",
    priority: "high",
    actualCostCents: 12500,
    vendorName: "Atlas Plumbing",
    assignmentStatus: "assigned",
    photoCount: 2,
    latestPhotoId: "photo-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    resolvedAt: null,
    tenantEmail: "tenant@example.com",
    commentCount: 1,
    comments: [],
    timeline: []
  };

  it("renders the ticket list when tickets exist", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("Leaking sink")).toBeInTheDocument();
  });

  it("shows the empty state when no tickets exist", () => {
    render(<MaintenanceSection tickets={[]} />);

    expect(screen.getByText("No maintenance tickets")).toBeInTheDocument();
  });

  it("shows ticket title and property details", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("Atlas House • Unit 1A")).toBeInTheDocument();
    expect(screen.getByText("tenant@example.com")).toBeInTheDocument();
  });

  it("shows status badge with the formatted status", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("shows the priority badge", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("renders status update controls when showControls is true", () => {
    render(<MaintenanceSection tickets={[ticket]} showControls onUpdateStatus={async () => null} />);

    expect(screen.getByTestId("status-control-ticket-1")).toBeInTheDocument();
  });

  it("renders vendor assignment controls when vendor workflow is enabled", () => {
    render(
      <MaintenanceSection
        tickets={[ticket]}
        showControls
        onUpdateStatus={async () => null}
        vendors={[{ id: "vendor-1", name: "Atlas Plumbing", preferred: true }]}
        onAssignVendor={async () => null}
        vendorWorkflowEnabled
      />
    );

    expect(screen.getByTestId("vendor-control-ticket-1")).toBeInTheDocument();
  });

  it("shows the conversation toggle when comments are available", () => {
    const { container } = render(<MaintenanceSection tickets={[ticket]} />);

    expect(container.querySelector("summary")).toHaveTextContent("Conversation");
  });
});
