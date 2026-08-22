import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock LoginForm since it depends on Supabase client
vi.mock("../auth/login-form", () => ({
  LoginForm: ({
    nextPath,
    role
  }: {
    nextPath: string;
    role?: "owner" | "manager" | "tenant";
  }) => (
    <div data-testid={`login-form-${nextPath}`} data-role={role}>
      Login form for {nextPath}
    </div>
  ),
}));

import { RoleSelector } from "../auth/role-selector";

describe("RoleSelector", () => {
  it("renders all three role cards", () => {
    render(<RoleSelector />);
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("Tenant")).toBeInTheDocument();
  });

  it("renders role descriptions", () => {
    render(<RoleSelector />);
    expect(
      screen.getByText("Manage properties, rent, and reports.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Manage assigned properties and tenant needs.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pay rent, report problems, and view lease documents.")
    ).toBeInTheDocument();
  });

  it("does not show login form initially", () => {
    render(<RoleSelector />);
    expect(screen.queryByTestId("login-form-/owner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-form-/manager")).not.toBeInTheDocument();
    expect(screen.queryByTestId("login-form-/tenant")).not.toBeInTheDocument();
  });

  it("shows login form when a role card is clicked", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    await user.click(screen.getByText("Owner"));
    expect(screen.getByTestId("login-form-/owner")).toBeInTheDocument();
    expect(screen.getByTestId("login-form-/owner")).toHaveAttribute("data-role", "owner");
  });

  it("shows the 'Choose a different role' back button when a role is selected", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    await user.click(screen.getByText("Tenant"));
    expect(screen.getByText("Choose a different role")).toBeInTheDocument();
  });

  it("hides login form when back button is clicked", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    await user.click(screen.getByText("Owner"));
    expect(screen.getByTestId("login-form-/owner")).toBeInTheDocument();

    await user.click(screen.getByText("Choose a different role"));
    expect(screen.queryByTestId("login-form-/owner")).not.toBeInTheDocument();
  });

  it("switches login form when clicking a different role card after one is already selected", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    // Select Owner
    await user.click(screen.getByText("Owner"));
    expect(screen.getByTestId("login-form-/owner")).toBeInTheDocument();

    // Deselect Owner first (click same card again)
    await user.click(screen.getByText("Owner"));
    expect(screen.queryByTestId("login-form-/owner")).not.toBeInTheDocument();

    // Now select Manager
    await user.click(screen.getByText("Manager"));
    expect(screen.getByTestId("login-form-/manager")).toBeInTheDocument();
  });

  it("toggles the same role on and off", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    // Click to select
    await user.click(screen.getByText("Tenant"));
    expect(screen.getByTestId("login-form-/tenant")).toBeInTheDocument();

    // Click again to deselect
    await user.click(screen.getByText("Tenant"));
    expect(screen.queryByTestId("login-form-/tenant")).not.toBeInTheDocument();
  });
});
