import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagerReminderPermissions } from "@/components/settings/notification-preferences";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("manager reminder setting", () => {
  it("shows only eligible accounts passed by the server and sends no actor field", async () => {
    const action = vi.fn(async (_previous: unknown, _data: FormData) => ({ success: true as const }));
    const { rerender } = render(<ManagerReminderPermissions accounts={[]} onSetPermission={action} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    rerender(<ManagerReminderPermissions accounts={[{ id: "account-1", name: "Home", enabled: false }]}
      onSetPermission={action} />);
    expect(screen.getByText("Let my manager send rent reminders")).toBeInTheDocument();
    expect(screen.getByText("Your manager can remind tenants about rent.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][1] as FormData;
    expect(data.get("accountId")).toBe("account-1");
    expect(data.get("enabled")).toBe("true");
    expect(data.has("p_actor_id")).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });
  it("shows an action error", async () => {
    render(<ManagerReminderPermissions accounts={[{ id: "account-1", name: "Home", enabled: false }]}
      onSetPermission={async () => ({ success: false, error: "Only the owner can change this." })} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText("Only the owner can change this.")).toBeInTheDocument();
  });
});
