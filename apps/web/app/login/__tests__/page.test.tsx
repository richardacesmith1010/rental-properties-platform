import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { buildConfirmCallbackUrl } from "@/lib/route-resolver";

const { getUser, getRole, getState, redirect, sessionCookie } = vi.hoisted(() => ({
  getUser: vi.fn(), getRole: vi.fn(), getState: vi.fn(), redirect: vi.fn(),
  sessionCookie: { value: undefined as string | undefined }
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(), getCurrentUserRole: getRole, getAuthState: getState
}));
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: null } });
  getState.mockResolvedValue({ hasProfile: true, onboardingComplete: true, role: "tenant", needsPasswordSet: false });
  sessionCookie.value = undefined;
  redirect.mockImplementation((url: string) => { throw new Error(`REDIRECT:${url}`); });
});

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: sessionCookie.value }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({ auth: { getUser } })
}));
vi.mock("@/components/auth/sign-in-form", () => ({ SignInForm: ({ next }: { next?: string }) =>
  <div data-testid="sign-in-form">{next ? <input type="hidden" name="next" value={next} /> : null}</div> }));
vi.mock("@/components/auth/create-account-form", () => ({
  CreateAccountForm: ({ initialRole }: { initialRole?: string }) =>
    <div data-testid="create-account-form" data-role={initialRole} />
}));

describe("LoginPage", () => {
  it.each(["owner", "manager", "tenant"])("redirects a signed-in %s to their role home", async (role) => {
    getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    getRole.mockResolvedValue(role);
    getState.mockResolvedValue({ hasProfile: true, onboardingComplete: true, role, needsPasswordSet: false });
    await expect(LoginPage({})).rejects.toThrow(`REDIRECT:/${role}`);
    expect(getRole).toHaveBeenCalledWith("test-user");
  });

  it("still redirects a signed-in user with a deletion notice", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    getRole.mockResolvedValue("tenant");
    await expect(LoginPage({ searchParams: Promise.resolve({ deleted: "requested" }) }))
      .rejects.toThrow("REDIRECT:/tenant");
  });

  it("S7 sends a signed-in tenant to an allowed next page", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    getRole.mockResolvedValue("tenant");
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/tenant?section=rent" }) }))
      .rejects.toThrow("REDIRECT:/tenant?section=rent");
  });

  it.each([["/owner", "/tenant"], [["/tenant", "//evil.com"], "/tenant"]])(
    "S7/S11 rejects disallowed or repeated next %s", async (next, destination) => {
      getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
      getRole.mockResolvedValue("tenant");
      await expect(LoginPage({ searchParams: Promise.resolve({ next }) }))
        .rejects.toThrow(`REDIRECT:${destination}`);
    }
  );

  it.each([
    [{ hasProfile: true, onboardingComplete: false, role: "owner", needsPasswordSet: false }, "/onboarding"],
    [{ hasProfile: true, onboardingComplete: false, role: "owner", needsPasswordSet: true }, "/complete-profile"]
  ])("S7 preserves incomplete profile destination %s", async (state, destination) => {
    getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    getRole.mockResolvedValue("owner");
    getState.mockResolvedValue(state);
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/owner/money" }) }))
      .rejects.toThrow(`REDIRECT:${destination}`);
  });

  it.each([["/tenant", "/tenant"], ["//evil.com", null], [["/owner", "//evil.com"], null]])(
    "S7/S11 renders a hidden next input only for one safe path %s", async (next, expected) => {
      render(await LoginPage({ searchParams: Promise.resolve({ next }) }));
      expect(document.querySelector('input[name="next"]')?.getAttribute("value") ?? null).toEqual(expected);
    }
  );

  it("shows the deletion request notice only for the requested value", async () => {
    const { unmount } = render(await LoginPage({ searchParams: Promise.resolve({ deleted: "requested" }) }));
    expect(screen.getByRole("status")).toHaveTextContent("We got your request.");
    expect(screen.getByRole("status")).toHaveTextContent("Your account will be deleted within 30 days.");
    unmount();
    const empty = render(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    empty.unmount();
    render(await LoginPage({ searchParams: Promise.resolve({ deleted: "yes" }) }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

describe("S9 email confirmation return navigation", () => {
  it.each([
    ["email", "/owner", "/auth/callback?token_hash=tok&type=email&next=%2Fowner"],
    ["signup", "/owner", "/auth/callback?token_hash=tok&type=signup&next=%2Fowner"],
    ["magiclink", "/owner", "/auth/callback?token_hash=tok&type=magiclink&next=%2Fowner"],
    ["email", "//evil.com", "/auth/callback?token_hash=tok&type=email"],
    ["invite", "/owner", "/auth/callback?token_hash=tok&type=invite"],
    ["recovery", "/owner", "/auth/callback?token_hash=tok&type=recovery"]
  ])("builds the exact callback URL for %s with %s", (type, next, expected) => {
    expect(buildConfirmCallbackUrl("tok", type, next)).toEqual(expected);
  });
});
