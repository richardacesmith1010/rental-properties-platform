import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StripeHealthBanner } from "@/components/dashboard/stripe-health-banner";

describe("StripeHealthBanner", () => {
  it("renders nothing when the status is active", () => {
    const { container } = render(<StripeHealthBanner status="active" />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the status is null", () => {
    const { container } = render(<StripeHealthBanner status={null} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders the missing-account copy", () => {
    render(<StripeHealthBanner status="missing" />);

    expect(screen.getByText("Your bank connection is missing")).toBeInTheDocument();
    expect(
      screen.getByText("We can't find your bank in Stripe. Reconnect now so tenants can pay rent.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect bank" })).toHaveAttribute(
      "href",
      "/connect/onboard"
    );
  });

  it("renders the restricted-account copy", () => {
    render(<StripeHealthBanner status="restricted" />);

    expect(screen.getByText("Your bank connection needs attention")).toBeInTheDocument();
    expect(
      screen.getByText("Stripe needs more info before they can send rent to your bank. Finish setup now.")
    ).toBeInTheDocument();
  });
});
