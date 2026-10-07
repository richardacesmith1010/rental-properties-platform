import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })
}));
vi.mock("@/components/auth/role-selector", () => ({
  RoleSelector: ({ initialRole, initialMode }: { initialRole?: string; initialMode?: string }) => (
    <div data-testid="role-selector" data-role={initialRole} data-mode={initialMode}>
      {initialMode === "signup" ? "Owner sign-up form" : "Sign-in form"}
    </div>
  )
}));

describe("LoginPage", () => {
  it("opens owner sign-up with the right heading and form", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ mode: "signup", role: "owner" }) }));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByText("Owner sign-up form")).toBeInTheDocument();
    expect(screen.getByTestId("role-selector")).toHaveAttribute("data-role", "owner");
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });

  it("keeps default sign-in and offers direct sign-up", async () => {
    render(await LoginPage({}));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to your workspace" })).toBeInTheDocument();
    expect(screen.getByText("Your rental workspace").closest("section")).toHaveClass("hidden");
    expect(screen.getByRole("link", { name: "Create an account" }))
      .toHaveAttribute("href", "/login?mode=signup&role=owner");
    expect(screen.queryByText(/500\+|2,000\+/)).not.toBeInTheDocument();
  });
});
