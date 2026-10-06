import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "@/components/marketing/landing-page";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { AddLeaseStep } from "@/components/onboarding/steps/add-lease-step";

vi.mock("@/components/marketing/animate-on-scroll", () => ({
  AnimateOnScroll: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

describe("owner first impression", () => {
  it("sends both start links to owner sign-up and makes no reminder promise", () => {
    render(<LandingPage />);
    expect(screen.getAllByRole("link", { name: "Start free" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Start free" })) {
      expect(link).toHaveAttribute("href", "/login?mode=signup&role=owner");
    }
    expect(screen.queryByText(/reminds tenants|sends reminders/i)).not.toBeInTheDocument();
    expect(screen.getByText(/It shows you who has paid/)).toBeInTheDocument();
  });

  it("shows homes and no dead tour link in the welcome card", () => {
    render(<WelcomeCard displayName="Alex" onContinue={vi.fn()} steps={[
      { id: "property", label: "Add a home", description: "Add your home.", completed: false }
    ]} />);
    expect(screen.getByRole("button", { name: "Add Your First Home" })).toBeInTheDocument();
    expect(screen.getByText(/your homes and tenants/)).toBeInTheDocument();
    expect(screen.queryByText(/2-minute tour|charges/i)).not.toBeInTheDocument();
  });

  it("moves from the first unit to the existing tenant invite flow", async () => {
    const advance = vi.fn();
    render(<AddLeaseStep unitId="unit-1" monthlyRentDollars={1000}
      onCreateLease={vi.fn()} onComplete={vi.fn()} onSkip={advance} />);
    expect(screen.queryByLabelText(/Tenant Profile ID/)).not.toBeInTheDocument();
    await waitFor(() => expect(advance).toHaveBeenCalledOnce());
  });
});
