import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import type { ActionState } from "@/app/actions";
import {
  DEFAULT_NOTIFICATION_EMAIL_PREFERENCES,
  notificationPreferenceOptionsForRole
} from "@/lib/notification-preferences";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const noop = async (_prev: ActionState, _form: FormData): Promise<ActionState> => ({ success: true });
const settings = {
  preferences: { ...DEFAULT_NOTIFICATION_EMAIL_PREFERENCES, manager_invoice: false },
  pausedUntil: null,
  schemaReady: true
};

function renderRole(role: "owner" | "manager" | "tenant", onUpdatePreferences = vi.fn(noop)) {
  render(<NotificationPreferences options={notificationPreferenceOptionsForRole(role)} settings={settings}
    onUpdatePreferences={onUpdatePreferences} onPauseNotifications={noop} onResumeNotifications={noop} />);
  return onUpdatePreferences;
}

describe("notification preferences by role", () => {
  it("R2 shows six tenant switches and no manager invoice", () => {
    renderRole("tenant");
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(screen.getByText("Rent reminders")).toBeInTheDocument();
    expect(screen.getByText("Email me when my repair is started or fixed.")).toBeInTheDocument();
    expect(screen.queryByText("My invoices")).not.toBeInTheDocument();
  });

  it("R2 omits rent reminders for managers and invoices for owners", () => {
    const { unmount } = render(<NotificationPreferences options={notificationPreferenceOptionsForRole("manager")}
      settings={settings} onUpdatePreferences={noop} onPauseNotifications={noop} onResumeNotifications={noop} />);
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(screen.queryByText("Rent reminders")).not.toBeInTheDocument();
    expect(screen.getByText("My invoices")).toBeInTheDocument();
    unmount();
    renderRole("owner");
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(screen.getByText("Rent reminders")).toBeInTheDocument();
    expect(screen.queryByText("My invoices")).not.toBeInTheDocument();
  });

  it("R3 submits only the visible key toggled", async () => {
    const update = renderRole("tenant");
    const repairRow = screen.getByText("Repairs").closest("div.rounded-2xl");
    expect(repairRow).not.toBeNull();
    fireEvent.click(within(repairRow as HTMLElement).getByRole("switch"));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    const form = update.mock.calls[0][1] as FormData;
    expect([...form.entries()]).toEqual([["preferenceKey", "maintenance_updates"]]);
  });
});
