import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectBanner } from "@/components/dashboard/connect-banner";

describe("ConnectBanner", () => {
  it("shows the connect banner when connected is false", () => {
    render(<ConnectBanner connected={false} role="owner" />);

    expect(screen.getByText("Connect Your Bank Account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect Now" })).toHaveAttribute("href", "/connect/onboard");
  });

  it("shows the connected state when connected is true", () => {
    render(<ConnectBanner connected={true} role="owner" />);

    expect(screen.getByText("Bank Connected")).toBeInTheDocument();
  });

  it("renders the owner-specific message", () => {
    render(<ConnectBanner connected={false} role="owner" />);

    expect(screen.getByText("Connect your bank account to receive rent payments directly.")).toBeInTheDocument();
  });

  it("renders the manager-specific message", () => {
    render(<ConnectBanner connected={false} role="manager" />);

    expect(screen.getByText("Connect your bank account to receive management fee payments.")).toBeInTheDocument();
  });
});
