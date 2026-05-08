import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordSettings } from "@/components/settings/password-settings";

const updateUser = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      updateUser
    }
  })
}));

describe("PasswordSettings", () => {
  beforeEach(() => {
    updateUser.mockReset();
    updateUser.mockResolvedValue({ error: null });
  });

  it("shows the shared password-strength error for weak passwords", async () => {
    render(<PasswordSettings />);

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "Short1" }
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "Short1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    expect(
      await screen.findByText("Use at least 8 characters", { selector: "div" })
    ).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("submits valid passwords that match the auth policy", async () => {
    render(<PasswordSettings />);

    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "Password1" }
    });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "Password1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: "Password1" });
    });

    expect(await screen.findByText("Password updated successfully.")).toBeInTheDocument();
  });
});
