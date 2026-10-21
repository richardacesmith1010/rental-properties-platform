import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import ResetPasswordPage from "@/app/reset-password/page";
import { DomusMark, DomusWordmark } from "@/components/brand/domus-mark";
import { LandingPage } from "@/components/marketing/landing-page";
import { faqs } from "@/components/marketing/landing-content";
import { SignInForm } from "@/components/auth/sign-in-form";
import { CreateAccountForm } from "@/components/auth/create-account-form";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser } }) }));
vi.mock("@/app/actions/login", () => ({ loginAction: vi.fn() }));
vi.mock("@/app/actions/forgot-password", () => ({ forgotPasswordAction: vi.fn() }));

beforeEach(() => getUser.mockResolvedValue({ data: { user: null } }));

function hasNoOldShape(container: HTMLElement) {
  expect(container.querySelector('[class*="rounded-full"], [class*="rounded-[14px]"]')).toBeNull();
}

describe("front door look", () => {
  it("mark renders exactly the doorway paths and wordmark", () => {
    const { container } = render(<><DomusMark /><DomusMark tile={false} /><DomusWordmark /></>);
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg.querySelectorAll("path")).toHaveLength(2);
      expect(svg.querySelector("circle")).toBeNull();
    }
    expect(container.querySelector('[class*="bg-[var(--action)]"]')).toBeInTheDocument();
    expect(screen.getByTestId("domus-wordmark")).toHaveTextContent("Domus");
    expect(screen.getByTestId("domus-wordmark").querySelector(".font-display")).toBeInTheDocument();
  });

  it("login uses the wordmark, serif titles, and square shapes", async () => {
    const { container } = render(await LoginPage({}));
    expect(screen.getByTestId("domus-wordmark")).toBeInTheDocument();
    expect(container.querySelector(".lucide-house")).toBeNull();
    for (const heading of container.querySelectorAll("h1")) expect(heading).toHaveClass("font-display");
    hasNoOldShape(container);
  });

  it("landing keeps its headings with serif titles and square shapes", () => {
    const { container } = render(<LandingPage />);
    expect(screen.getByTestId("domus-wordmark")).toBeInTheDocument();
    for (const heading of container.querySelectorAll("h1, h2")) expect(heading).toHaveClass("font-display");
    for (const text of ["Rent, repairs, and leases. All in one place.", "October rent", "Sound familiar?",
      "What Domus does", "How it works", "Free while Domus is in early access", "Questions"]) {
      expect(screen.getByRole("heading", { name: text })).toBeInTheDocument();
    }
    hasNoOldShape(container);
  });

  it("answers the free-plan FAQ with the approved terms", () => {
    expect(faqs.find((item) => item.q === "Is Domus really free?")?.a).toBe(
      "Yes. Domus is free for landlords and tenants. You don't need a credit card."
    );
  });

  it("shows the reset-password subtitle exactly once", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    render(await ResetPasswordPage());
    expect(screen.getAllByText("Enter a new password for your Domus account.")).toHaveLength(1);
    expect(screen.queryByText("Set a new password for your Domus account.")).not.toBeInTheDocument();
  });

  it("auth forms use square fields and action submit", () => {
    const signIn = render(<SignInForm />);
    for (const element of signIn.container.querySelectorAll("input, button")) {
      expect(element.className).not.toContain("rounded-[14px]");
    }
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveClass("bg-[var(--action)]");
    signIn.unmount();

    const signup = render(<CreateAccountForm />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    for (const element of signup.container.querySelectorAll("input, button")) {
      expect(element.className).not.toContain("rounded-[14px]");
    }
  });
});
