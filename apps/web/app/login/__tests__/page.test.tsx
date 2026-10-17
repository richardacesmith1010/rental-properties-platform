import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";

const { getUser, getRole, redirect, sessionCookie } = vi.hoisted(() => ({
  getUser: vi.fn(), getRole: vi.fn(), redirect: vi.fn(), sessionCookie: { value: undefined as string | undefined }
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), getCurrentUserRole: getRole
}));
beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: null } });
  sessionCookie.value = undefined;
  redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: sessionCookie.value }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } })
}));
vi.mock("@/components/auth/sign-in-form", () => ({ SignInForm: () => <div data-testid="sign-in-form" /> }));
vi.mock("@/components/auth/create-account-form", () => ({
  CreateAccountForm: ({ initialRole }: { initialRole?: string }) =>
    <div data-testid="create-account-form" data-role={initialRole} />
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
    expect(screen.getByTestId("create-account-form")).toHaveAttribute("data-role", "owner");
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });

  it("keeps default sign-in and offers direct sign-up", async () => {
    render(await LoginPage({}));
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Sign in to see your rent, bills and homes.")).toBeInTheDocument();
    expect(screen.getByTestId("sign-in-form")).toBeInTheDocument();
    expect(screen.getByText("Your rental workspace").closest("section")).toHaveClass("hidden");
    expect(screen.queryByText(/500\+|2,000\+/)).not.toBeInTheDocument();
  });

  it("shows Privacy and Terms links on the sign-in page", async () => {
    render(await LoginPage({}));
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it.each([
    ["session expired", { cookie: "1" }, "Your session expired."],
    ["confirmed=true", { confirmed: "true" }, "Email confirmed!"],
    ["password_reset=true", { password_reset: "true" }, "Password updated!"],
    ["invite_expired", { error: "invite_expired" }, "Invitation link expired"],
    ["reset_link_expired", { error: "reset_link_expired" }, "This reset link has expired"],
    ["other error", { error: "unknown" }, "Sign-in link failed."]
  ])("8.2 renders %s alert copy", async (_name, params, copy) => {
    sessionCookie.value = "cookie" in params ? params.cookie : undefined;
    const searchParams = "cookie" in params ? {} : params;
    render(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
    expect(screen.getByText(copy)).toBeInTheDocument();
  });
});
