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
});
