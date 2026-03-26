import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSwitcher } from "@/components/dashboard/account-switcher";
import type { OwnershipAccountDTO } from "@/lib/ownership";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn()
  }),
  usePathname: () => "/owner",
  useSearchParams: () => new URLSearchParams("section=home")
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const accounts: OwnershipAccountDTO[] = [
  {
    id: "account-1",
    accountType: "individual",
    displayName: "Ace Holdings",
    memberCount: 1,
    joinCode: null,
    stripeConnected: false,
    distributionMode: "retain",
    plaidConnected: false,
    bankName: null,
    bankMask: null,
    balanceCents: null,
    balanceUpdatedAt: null
  },
  {
    id: "account-2",
    accountType: "llc",
    displayName: "J&MSP",
    memberCount: 2,
    joinCode: null,
    stripeConnected: false,
    distributionMode: "retain",
    plaidConnected: false,
    bankName: null,
    bankMask: null,
    balanceCents: null,
    balanceUpdatedAt: null
  }
];

describe("AccountSwitcher", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens the switcher menu on click", () => {
    render(<AccountSwitcher accounts={accounts} activeAccountId="account-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Switch ownership account" }));

    expect(screen.getByRole("listbox", { name: "Available ownership accounts" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "J&MSP" })).toBeInTheDocument();
  });

  it("navigates to the selected account", () => {
    render(<AccountSwitcher accounts={accounts} activeAccountId="account-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Switch ownership account" }));
    fireEvent.click(screen.getByRole("option", { name: "J&MSP" }));

    expect(pushMock).toHaveBeenCalledWith("/owner?section=home&account=account-2");
  });
});
