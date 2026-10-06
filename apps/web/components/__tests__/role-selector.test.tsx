import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock LoginForm since it depends on Supabase client
vi.mock("../auth/login-form", () => ({
  LoginForm: ({
    nextPath,
    role,
    initialMode
  }: {
    nextPath: string;
    role?: "owner" | "manager" | "tenant";
    initialMode?: "signin" | "signup";
  }) => (
    <div data-testid={`login-form-${nextPath}`} data-role={role} data-mode={initialMode}>
      Login form for {nextPath}
    </div>
  ),
}));

import { RoleSelector } from "../auth/role-selector";

describe("RoleSelector", () => {
  it("opens owner sign-up without clipping the form", () => {
    render(<RoleSelector initialRole="owner" initialMode="signup" />);
    const form = screen.getByTestId("login-form-/owner");
    expect(form).toHaveAttribute("data-mode", "signup");
    expect(form.parentElement?.parentElement).not.toHaveClass("overflow-hidden", "max-h-[400px]");
    expect(form.parentElement?.parentElement?.parentElement).toHaveClass("sm:col-span-2");
  });

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

  it("keeps non-selected cards visible but inert and hidden from assistive technology", async () => {
    const user = userEvent.setup();
    render(<RoleSelector />);

    await user.click(screen.getByText("Owner"));
    const owner = screen.getByText("Owner").closest("button");
    const manager = screen.getByText("Manager").closest("button");
    const tenant = screen.getByText("Tenant").closest("button");

    expect(owner).not.toHaveAttribute("inert");
    for (const card of [manager, tenant]) {
      expect(card).toHaveAttribute("inert");
      expect(card).toHaveAttribute("aria-hidden", "true");
      expect(card).toHaveClass("opacity-40");
    }

    await user.click(screen.getByRole("button", { name: "Choose a different role" }));
    for (const card of [manager, tenant]) {
      expect(card).not.toHaveAttribute("inert");
      expect(card).not.toHaveAttribute("aria-hidden");
    }
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
