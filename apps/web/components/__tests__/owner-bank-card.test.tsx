import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OwnerBankCard } from "@/components/dashboard/owner-bank-card";

describe("manager bank card", () => {
  it("shows the manager fee copy when disconnected", () => {
    render(<OwnerBankCard role="manager" state={{ status: "not_started", href: "/connect/onboard" }} />);
    expect(screen.getByText("Connect your bank to get your fees")).toBeVisible();
    expect(screen.getByText("Your management fees can’t reach you until this is done.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Connect bank" })).toHaveAttribute("href", "/connect/onboard");
  });

  it("stays hidden when the manager is connected", () => {
    render(<OwnerBankCard role="manager" state={{ status: "connected", href: "/connect/onboard" }} />);
    expect(screen.queryByText("Connect your bank to get your fees")).not.toBeInTheDocument();
  });

  it("uses fee wording for manager setup that needs more information", () => {
    render(<OwnerBankCard role="manager" state={{ status: "needs_info", href: "/connect/onboard" }} />);
    expect(screen.getByText("Stripe needs one more thing")).toBeVisible();
    expect(screen.getByText("Your bank is almost ready. Answer a few questions so your fees can reach you.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Finish setup" })).toHaveAttribute("href", "/connect/onboard");
  });

  it("keeps owner rent wording for setup that needs more information", () => {
    render(<OwnerBankCard role="owner" state={{ status: "needs_info", href: "/connect/onboard" }} />);
    expect(screen.getByText("Your bank is almost ready. Answer a few questions so rent can reach you.")).toBeVisible();
  });
});
