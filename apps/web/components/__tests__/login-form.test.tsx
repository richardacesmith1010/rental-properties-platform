import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks }) }));
vi.mock("@/lib/password-validation", () => ({
  validatePassword: () => ({ isValid: true, errors: [] }), mapAuthErrorMessage: (message: string) => message
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: () => [{}, vi.fn()], useFormStatus: () => ({ pending: false })
}));

async function signUp(result: unknown = { data: { user: { identities: [{}] } }, error: null }) {
  mocks.signUp.mockResolvedValue(result);
  render(<LoginForm />);
  fireEvent.click(screen.getByText("Sign up"));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "Password123" } });
  fireEvent.submit(screen.getByText("Create account").closest("form")!);
  await screen.findByText("Check your email");
}

beforeEach(() => { vi.clearAllMocks(); });
describe("sign-up confirmation", () => {
  it("gives both sign-in and sign-up toggles a 44 px minimum target", () => {
    render(<LoginForm />);
    const signUpToggle = screen.getByRole("button", { name: "Sign up" });
    expect(signUpToggle).toHaveClass("inline-flex", "min-h-11", "items-center");

    fireEvent.click(signUpToggle);
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveClass("inline-flex", "min-h-11", "items-center");
  });

  it("opens directly in sign-up mode when requested", () => {
    render(<LoginForm role="owner" initialMode="signup" />);
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
  });

  it("shows the same screen for an existing-user result", async () => {
    await signUp({ data: { user: { identities: [] } }, error: null });
    expect(screen.getByText(/Used this email with Domus before/)).toBeInTheDocument();
    expect(screen.getByText("Forgot password")).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(["already", "has an account"].join(" ")))).not.toBeInTheDocument();
  });
  it("shows the same screen for an existing-user auth error", async () => {
    await signUp({ data: { user: null }, error: { code: "user_already_exists", message: "User already registered" } });
    expect(screen.getByText(/Used this email with Domus before/)).toBeInTheDocument();
    expect(screen.getByText("Send it again")).toBeInTheDocument();
  });
  it.each([
    { data: {}, error: null },
    { data: {}, error: { message: "rate limit" } },
    { data: {}, error: { message: "user not found" } }
  ])("uses identical resend result for every auth response", async (result) => {
    await signUp();
    mocks.resend.mockResolvedValue(result);
    fireEvent.click(screen.getByText("Send it again"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again in 60s" })).toBeDisabled());
    expect(screen.getByText("If this email needs confirming, we sent a new link. Check your inbox.")).toBeInTheDocument();
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup", email: "person@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
  });
  it("shows connection error only for a thrown network failure", async () => {
    await signUp();
    mocks.resend.mockRejectedValue(new TypeError("network failed"));
    fireEvent.click(screen.getByText("Send it again"));
    expect(await screen.findByText("Check your connection and try again.")).toBeInTheDocument();
    expect(screen.getByText("Send it again")).toBeEnabled();
  });
});
