import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersSection } from "@/components/dashboard/members-section";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";

const refreshMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const clipboardWriteTextMock = vi.hoisted(() => vi.fn());

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();
  return {
    ...actual,
    useFormState: () => [null, async () => null] as const,
    useFormStatus: () => ({ pending: false, data: null, method: null, action: null })
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  })
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock
  }
}));

describe("MembersSection", () => {
  const account: OwnershipAccountDTO = {
    id: "account-1",
    accountType: "llc",
    displayName: "J&MSP",
    memberCount: 2,
    joinCode: "A1B2C3",
    stripeConnected: false,
    distributionMode: "split_custom",
    stripeAccountId: null,
    plaidConnected: false,
    bankName: null,
    bankMask: null,
    balanceCents: null,
    balanceUpdatedAt: null
  };

  const members: OwnershipMemberDTO[] = [
    {
      profileId: "user-1",
      email: "ace@example.com",
      fullName: "Ace Smith",
      memberRole: "owner",
      active: true,
      canReceiveCriticalAlerts: true,
      distributionPct: 50,
      payoutStripeConnected: true
    },
    {
      profileId: "user-2",
      email: "sibling@example.com",
      fullName: "Jordan Smith",
      memberRole: "member",
      active: true,
      canReceiveCriticalAlerts: true,
      distributionPct: 50,
      payoutStripeConnected: false
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText: clipboardWriteTextMock },
      configurable: true
    });
    clipboardWriteTextMock.mockResolvedValue(undefined);
  });

  it("renders the join code and member summary", () => {
    render(
      <MembersSection
        account={account}
        members={members}
        currentUserId="user-1"
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("J&MSP")).toBeInTheDocument();
    expect(screen.getByText("A1B2C3")).toBeInTheDocument();
    expect(screen.getByText("2 members")).toBeInTheDocument();
    expect(screen.getByText("Distribution Settings")).toBeInTheDocument();
  });

  it("copies the join code to the clipboard", async () => {
    render(
      <MembersSection
        account={account}
        members={members}
        currentUserId="user-1"
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Code" }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith("A1B2C3");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Join code copied.");
  });

  it("highlights the current user and only shows remove for other members", () => {
    render(
      <MembersSection
        account={account}
        members={members}
        currentUserId="user-1"
        onRemoveOwnershipMember={async () => ({ success: true, message: "Removed." })}
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove ace smith/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("opens the share modal with a prefilled Domus invite draft", () => {
    render(
      <MembersSection
        account={account}
        members={members}
        currentUserId="user-1"
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Share via Email" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Join J&MSP on Domus")).toBeInTheDocument();
    expect(
      (screen.getByRole("textbox", { name: "Email body preview." }) as HTMLTextAreaElement).value
    ).toContain("A1B2C3");
  });
});
