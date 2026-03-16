import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationsSection } from "@/components/dashboard/notifications-section";
import type { NotificationDTO } from "@/lib/notifications";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: "post", action: null })
  };
});

describe("NotificationsSection", () => {
  const notifications: NotificationDTO[] = [
    {
      id: "notification-1",
      type: "late_rent",
      title: "Late rent detected",
      body: "Unit 1A has an overdue balance.",
      entityType: "rent_charge",
      entityId: "charge-1",
      readAt: null,
      createdAt: "2026-03-05T12:00:00.000Z"
    },
    {
      id: "notification-2",
      type: "new_ticket",
      title: "New maintenance ticket",
      body: "Leaking sink submitted.",
      entityType: "maintenance_ticket",
      entityId: "ticket-1",
      readAt: "2026-03-05T13:00:00.000Z",
      createdAt: "2026-03-05T12:30:00.000Z"
    }
  ];

  it("renders the notification list when notifications exist", () => {
    render(<NotificationsSection notifications={notifications} onMarkRead={async () => null} />);

    expect(screen.getByText("Late rent detected")).toBeInTheDocument();
    expect(screen.getByText("New maintenance ticket")).toBeInTheDocument();
  });

  it("shows the empty state when no notifications exist", () => {
    render(<NotificationsSection notifications={[]} onMarkRead={async () => null} />);

    expect(screen.getByText("No notifications")).toBeInTheDocument();
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it("shows notification title and body", () => {
    render(<NotificationsSection notifications={[notifications[0]]} onMarkRead={async () => null} />);

    expect(screen.getByText("Late rent detected")).toBeInTheDocument();
    expect(screen.getByText("Unit 1A has an overdue balance.")).toBeInTheDocument();
  });

  it("shows the unread indicator for unread notifications", () => {
    render(<NotificationsSection notifications={notifications} onMarkRead={async () => null} />);

    expect(screen.getByText("1 unread")).toBeInTheDocument();
  });

  it("renders a mark read button for unread notifications", () => {
    render(<NotificationsSection notifications={[notifications[0]]} onMarkRead={async () => null} />);

    expect(screen.getByRole("button", { name: "Mark read" })).toBeInTheDocument();
  });

  it("renders a mark all read button when onMarkAllRead is provided", () => {
    render(
      <NotificationsSection
        notifications={notifications}
        onMarkRead={async () => null}
        onMarkAllRead={async () => null}
      />
    );

    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
  });
});
