import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/auth/sign-in-form";
import { CreateAccountForm } from "@/components/auth/create-account-form";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn(), login: vi.fn(), pending: false, state: {} as { error?: string } }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks }) }));
vi.mock("@/app/actions/login", () => ({ loginAction: mocks.login }));
vi.mock("@/app/actions/forgot-password", () => ({ forgotPasswordAction: vi.fn() }));
vi.mock("react-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-dom")>(),
  useFormState: (action: (state: unknown, data: FormData) => unknown, initial: unknown) =>
    [mocks.state, (data: FormData) => action(initial, data)],
  useFormStatus: () => ({ pending: mocks.pending })
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = {};
  mocks.pending = false;
  mocks.signUp.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.login.mockResolvedValue({});
});

function details() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password123" } });
}
async function submitSignup() {
  fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
  await screen.findByText("Check your email");
}

describe("SignInForm", () => {
  it("8.1a renders only email and password, forgot and signup actions", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/login?mode=signup");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
  it("8.1b submits only email and password to loginAction", async () => {
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    expect([...new FormData(form).keys()]).toEqual(["email", "password"]);
    expect(form).toHaveAttribute("action");
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.login).toHaveBeenCalled());
    expect([...mocks.login.mock.calls[0][1].keys()]).toEqual(["email", "password"]);
  });
  it("8.1l shows Signing in… while pending", () => {
    mocks.pending = true;
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });
  it("8.1c shows action errors in an alert", () => {
    mocks.state = { error: "Wrong email or password." };
    render(<SignInForm />);
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong email or password.");
  });
  it("8.1d opens the existing forgot flow", () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });
});

describe("CreateAccountForm", () => {
  it.each([["manager", "I manage rentals for others"], [undefined, "I own rentals"],
    ["admin", "I own rentals"], ["../evil", "I own rentals"]])("8.3a-c and i defaults %s to %s", (role, label) => {
    render(<CreateAccountForm initialRole={role} />);
    expect(screen.getByRole("radio", { name: new RegExp(label) })).toBeChecked();
  });
  it("8.3d-e reveals fields and Change keeps email", () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "‹ Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Email")).toHaveValue("person@example.com");
  });
  it("8.3f sends tenant role and callback path", async () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("radio", { name: /I rent a home/ }));
    details(); await submitSignup();
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "person@example.com", password: "Password123",
      options: { data: { role: "tenant" },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Ftenant` } });
  });
  it.each(["admin", "../evil"])("8.3i allowlists invalid role %s at signUp", async (role) => {
    render(<CreateAccountForm initialRole={role} />);
    details(); await submitSignup();
    expect(mocks.signUp.mock.calls[0][0].options).toEqual({ data: { role: "owner" },
      emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fowner` });
  });
  it("8.3g,j shows identical check-email output for existing and new accounts", async () => {
    const first = render(<CreateAccountForm />);
    details(); await submitSignup();
    const normal = screen.getByText("Check your email").parentElement!.textContent;
    expect(screen.getByRole("button", { name: "Send it again" })).toBeInTheDocument();
    first.unmount();
    mocks.signUp.mockResolvedValue({ data: { user: null },
      error: { code: "user_already_exists", message: "User already registered" } });
    render(<CreateAccountForm />);
    details(); await submitSignup();
    expect(screen.getByText("Check your email").parentElement!.textContent).toBe(normal);
    expect(screen.getByRole("button", { name: "Send it again" })).toBeInTheDocument();
  });
  it("8.3g keeps resend response indistinguishable", async () => {
    render(<CreateAccountForm />);
    details(); await submitSignup();
    mocks.resend.mockResolvedValue({ data: {}, error: { message: "rate limit" } });
    fireEvent.click(screen.getByRole("button", { name: "Send it again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again in 60s" })).toBeDisabled());
    expect(screen.getByText("If this email needs confirming, we sent a new link. Check your inbox.")).toBeInTheDocument();
    expect(mocks.resend).toHaveBeenCalledWith({ type: "signup", email: "person@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
  });
  it("8.3h blocks weak and mismatched passwords", async () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "person@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "weak" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "weak" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    await waitFor(() => expect(mocks.signUp).not.toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("8.3l uses a native signup form and submit button for Enter", () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("Password").closest("form")).toBe(
      screen.getByRole("button", { name: "Create account" }).closest("form")
    );
    expect(screen.getByRole("button", { name: "Create account" })).toHaveAttribute("type", "submit");
  });
  it("8.3k uses changed radio selection", async () => {
    render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("radio", { name: /I manage rentals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "‹ Change" }));
    fireEvent.click(screen.getByRole("radio", { name: /I rent a home/ }));
    details(); await submitSignup();
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({ role: "tenant" });
    expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(/next=%2Ftenant$/);
  });
});
