import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/components/dashboard/maintenance/photo-gallery", () => ({
  PhotoGallery: ({ photos }: { photos: Array<{ id: string }> }) => (
    <div data-testid={`photo-gallery-${photos.length}`}>photo gallery</div>
  )
}));

vi.mock("@/components/dashboard/maintenance-comment-thread", () => ({
  MaintenanceCommentThread: ({ ticketId }: { ticketId: string }) => <div data-testid={`comment-thread-${ticketId}`}>comment thread</div>
}));

vi.mock("@/components/dashboard/maintenance-tracker", () => ({
  MaintenanceTracker: () => <div data-testid="maintenance-tracker">tracker</div>
}));

describe("MaintenanceSection", () => {
  function buildTicket({
    id,
    title,
    status,
    tenantEmail = "tenant@example.com",
    commentCount = 1
  }: {
    id: string;
    title: string;
    status: MaintenanceTicket["status"];
    tenantEmail?: string | null;
    commentCount?: number;
  }): MaintenanceTicket {
    return {
      id,
      propertyId: "property-1",
      propertyName: "Atlas House",
      unitNumber: "1A",
      title,
      description: "Kitchen sink is leaking under the cabinet.",
      status,
      priority: "high",
      actualCostCents: 12500,
      vendorName: "Atlas Plumbing",
      assignmentStatus: "assigned",
      photoCount: 2,
      latestPhotoId: "photo-1",
      photos: [
        {
          id: "photo-1",
          ticketId: id,
          uploadedBy: "tenant-1",
          fileName: "leak-1.jpg",
          fileType: "image/jpeg",
          fileSizeBytes: 1024,
          createdAt: "2026-03-01T00:00:00.000Z",
          url: "/api/assets/maintenance-photo/photo-1"
        }
      ],
      createdAt: "2026-03-01T00:00:00.000Z",
      resolvedAt: status === "resolved" || status === "closed" ? "2026-03-02T00:00:00.000Z" : null,
      tenantEmail,
      commentCount,
      comments: [],
      timeline: []
    };
  }

  const ticket = buildTicket({
    id: "ticket-1",
    title: "Leaking sink",
    status: "open"
  });

  const mixedTickets = [
    buildTicket({ id: "ticket-1", title: "Leaking sink", status: "open" }),
    buildTicket({ id: "ticket-2", title: "Broken heater", status: "in_progress" }),
    buildTicket({ id: "ticket-3", title: "Paint touch-up", status: "resolved" }),
    buildTicket({ id: "ticket-4", title: "Door fixed", status: "closed" })
  ];

  const activeOnlyTickets = [
    buildTicket({ id: "ticket-1", title: "Leaking sink", status: "open" }),
    buildTicket({ id: "ticket-2", title: "Broken heater", status: "in_progress" })
  ];

  const completedOnlyTickets = [
    buildTicket({ id: "ticket-3", title: "Paint touch-up", status: "resolved" }),
    buildTicket({ id: "ticket-4", title: "Door fixed", status: "closed" })
  ];

  it("defaults to the active filter and shows active counts", () => {
    render(<MaintenanceSection tickets={mixedTickets} />);

    expect(screen.getByRole("button", { name: "Active (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Completed (2)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All (4)" })).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("Leaking sink")).toBeInTheDocument();
    expect(screen.getByText("Broken heater")).toBeInTheDocument();
    expect(screen.queryByText("Paint touch-up")).not.toBeInTheDocument();
    expect(screen.queryByText("Door fixed")).not.toBeInTheDocument();
  });

  it("shows only completed tickets when the completed filter is selected", () => {
    render(<MaintenanceSection tickets={mixedTickets} />);

    fireEvent.click(screen.getByRole("button", { name: "Completed (2)" }));

    expect(screen.getByRole("button", { name: "Completed (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Leaking sink")).not.toBeInTheDocument();
    expect(screen.queryByText("Broken heater")).not.toBeInTheDocument();
    expect(screen.getByText("Paint touch-up")).toBeInTheDocument();
    expect(screen.getByText("Door fixed")).toBeInTheDocument();
  });

  it("shows every ticket when the all filter is selected without changing the underlying counts", () => {
    render(<MaintenanceSection tickets={mixedTickets} />);

    fireEvent.click(screen.getByRole("button", { name: "Completed (2)" }));
    fireEvent.click(screen.getByRole("button", { name: "All (4)" }));

    expect(screen.getByRole("button", { name: "Active (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completed (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All (4)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Leaking sink")).toBeInTheDocument();
    expect(screen.getByText("Broken heater")).toBeInTheDocument();
    expect(screen.getByText("Paint touch-up")).toBeInTheDocument();
    expect(screen.getByText("Door fixed")).toBeInTheDocument();
  });

  it("shows the active empty state when there are no active tickets", () => {
    render(<MaintenanceSection tickets={completedOnlyTickets} />);

    expect(screen.getByText("No active tickets right now.")).toBeInTheDocument();
  });

  it("shows the completed empty state when there are no completed tickets", () => {
    render(<MaintenanceSection tickets={activeOnlyTickets} />);

    fireEvent.click(screen.getByRole("button", { name: "Completed (0)" }));

    expect(screen.getByText("No completed tickets yet.")).toBeInTheDocument();
  });

  it("shows the all empty state when no tickets exist and all is selected", () => {
    render(<MaintenanceSection tickets={[]} />);

    expect(screen.getByText("No active tickets right now.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All (0)" }));

    expect(screen.getByText("No tickets yet.")).toBeInTheDocument();
  });

  it("renders the ticket list when tickets exist", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("Leaking sink")).toBeInTheDocument();
  });

  it("shows the active empty state when no tickets exist by default", () => {
    render(<MaintenanceSection tickets={[]} />);

    expect(screen.getByText("No active tickets right now.")).toBeInTheDocument();
  });

  it("shows ticket title and property details", () => {
    render(<MaintenanceSection tickets={[ticket]} />);

    expect(screen.getByText("Atlas House • 1A")).toBeInTheDocument();
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
