import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/app/actions";
import { NotificationBellMenu } from "@/components/dashboard/notification-bell-menu";
import type { NotificationDTO } from "@/lib/notifications";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: pushMock
  })
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn()
  }
}));

describe("NotificationBellMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  const notifications: NotificationDTO[] = [
    {
      id: "notification-1",
      type: "late_rent",
      title: "Late rent detected",
      body: "Unit 1A is overdue.",
      entityType: "charge",
      entityId: "charge-1",
      readAt: null,
      createdAt: "2026-03-22T10:00:00.000Z"
    },
    {
      id: "notification-2",
      type: "owner_message",
      title: "Owner message",
      body: "Please confirm the payment.",
      entityType: "message",
      entityId: "message-1",
      readAt: null,
      createdAt: "2026-03-22T09:00:00.000Z"
    }
  ];

  it("shows the unread badge and clear-all control", () => {
    render(
      <NotificationBellMenu
        notifications={notifications}
        role="owner"
        onDismissNotification={async () => ({ success: true })}
        onClearAllNotifications={async () => ({ success: true })}
        onSendBatchPaymentReminder={async () => ({ success: true, message: "Reminder sent." })}
        onWaiveCharge={async () => ({ success: true, message: "Charge waived." })}
        triggerClassName="inline-flex h-10 w-10 items-center justify-center"
      />
    );

    expect(screen.getByText("2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
    expect(screen.getByText("Late rent detected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Reminder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Charge" })).toBeInTheDocument();
  });

  it("clears the local badge and list when clear all succeeds", async () => {
    render(
      <NotificationBellMenu
        notifications={notifications}
        role="owner"
        onDismissNotification={async () => ({ success: true })}
        onClearAllNotifications={async () => ({ success: true })}
        triggerClassName="inline-flex h-10 w-10 items-center justify-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() => {
      expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    });

    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("dismisses individual notifications", async () => {
    render(
      <NotificationBellMenu
        notifications={notifications}
        role="owner"
        onDismissNotification={async () => ({ success: true })}
        onClearAllNotifications={async () => ({ success: true })}
        triggerClassName="inline-flex h-10 w-10 items-center justify-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Late rent detected" }));

    await waitFor(() => {
      expect(screen.queryByText("Late rent detected")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Owner message")).toBeInTheDocument();
  });

  it("marks a notification read before navigating from an action button", async () => {
    const dismissMock = vi.fn<(_: ActionState, formData: FormData) => Promise<ActionState>>(
      async () => ({ success: true })
    );

    render(
      <NotificationBellMenu
        notifications={notifications}
        role="owner"
        onDismissNotification={dismissMock}
        onClearAllNotifications={async () => ({ success: true })}
        triggerClassName="inline-flex h-10 w-10 items-center justify-center"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "View Charge" }));

    await waitFor(() => {
      expect(dismissMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/owner?section=charges&chargeId=charge-1");
      expect(screen.queryByText("Late rent detected")).not.toBeInTheDocument();
    });
  });
});
