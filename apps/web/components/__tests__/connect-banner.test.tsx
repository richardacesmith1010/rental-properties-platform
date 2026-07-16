import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectBanner } from "@/components/dashboard/connect-banner";

describe("ConnectBanner", () => {
  it("shows the connect banner when connected is false", () => {
    render(<ConnectBanner connected={false} role="owner" />);

    expect(screen.getByText("Set up rent payments.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up now" })).toHaveAttribute("href", "/connect/onboard");
  });

  it("shows the connected state when connected is true", () => {
    render(<ConnectBanner connected={true} role="owner" />);

    expect(screen.getByText("Rent payments are set up.")).toBeInTheDocument();
  });

  it("renders the owner-specific message", () => {
    render(<ConnectBanner connected={false} role="owner" />);

    expect(screen.getByText("Finish Stripe setup so your properties can collect rent.")).toBeInTheDocument();
  });

  it("renders the manager-specific message", () => {
    render(<ConnectBanner connected={false} role="manager" />);

    expect(screen.getByText("Finish Stripe setup so you can receive management fee payments.")).toBeInTheDocument();
  });

  it("uses the provided rent-account href without routing to member payouts", () => {
    render(<ConnectBanner connected={false} role="owner" href="/connect/onboard?accountId=llc_123" />);

    expect(screen.getByRole("link", { name: "Set up now" })).toHaveAttribute(
      "href",
      "/connect/onboard?accountId=llc_123"
    );
    expect(screen.getByRole("link", { name: "Set up now" }).getAttribute("href")).not.toContain("memberPayout");
  });
});
