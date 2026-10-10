import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const { getUser, getRole, redirect } = vi.hoisted(() => ({
  getUser: vi.fn(), getRole: vi.fn(), redirect: vi.fn()
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), getCurrentUserRole: getRole
}));
beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: null } });
  redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } })
}));
vi.mock("@/components/auth/role-selector", () => ({
  RoleSelector: ({ initialRole, initialMode }: { initialRole?: string; initialMode?: string }) => (
    <div data-testid="role-selector" data-role={initialRole} data-mode={initialMode}>
      {initialMode === "signup" ? "Owner sign-up form" : "Sign-in form"}
    </div>
  )
}));

describe("LoginPage", () => {
  it.each(["owner", "manager", "tenant"])("redirects a signed-in %s to their role home", async (role) => {
    getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    getRole.mockResolvedValue(role);
    await expect(LoginPage({})).rejects.toThrow(`REDIRECT:/${role}`);
    expect(getRole).toHaveBeenCalledWith("test-user");
  });

  it("places the native safe-area hook on the login top container", async () => {
    const page = await LoginPage({});
    expect(page.props.className.split(" ")).toContain("domus-login-page");
  });

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
