import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersSection } from "@/components/dashboard/members-section";
import type { LLCInvitationDTO } from "@/lib/llc-invitations";
import type { OwnershipAccountDTO, OwnershipMemberDTO } from "@/lib/ownership";

const refreshMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

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

  const pendingInvitations: LLCInvitationDTO[] = [
    {
      id: "invite-1",
      ownershipAccountId: "account-1",
      invitedBy: "user-1",
      email: "brother@example.com",
      token: "550e8400-e29b-41d4-a716-446655440020",
      status: "pending",
      createdAt: new Date().toISOString(),
      acceptedAt: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the LLC summary and invite form", () => {
    render(
      <MembersSection
        account={account}
        members={members}
        pendingInvitations={pendingInvitations}
        currentUserId="user-1"
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("J&MSP")).toBeInTheDocument();
    expect(screen.getByText("Invite Members")).toBeInTheDocument();
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("Distribution Settings")).toBeInTheDocument();
  });

  it("sends invitations from the multi-email textarea", async () => {
    const sendInvitations = vi.fn().mockResolvedValue({
      success: true,
      message: "Sent 2 invitations."
    });

    render(
      <MembersSection
        account={account}
        members={members}
        pendingInvitations={pendingInvitations}
        currentUserId="user-1"
        onSendLLCInvitations={sendInvitations}
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    fireEvent.change(screen.getByLabelText(/email addresses/i), {
      target: { value: "brother@example.com\nsister@example.com" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Invitations" }));

    await waitFor(() => {
      expect(sendInvitations).toHaveBeenCalledTimes(1);
    });
    const submittedFormData = sendInvitations.mock.calls[0][1] as FormData;
    expect(submittedFormData.get("accountId")).toBe("account-1");
    expect(submittedFormData.get("emails")).toBe("brother@example.com\nsister@example.com");
    expect(toastSuccessMock).toHaveBeenCalledWith("Sent 2 invitations.");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("highlights the current user and only shows remove for other members", () => {
    render(
      <MembersSection
        account={account}
        members={members}
        pendingInvitations={pendingInvitations}
        currentUserId="user-1"
        onRemoveOwnershipMember={async () => ({ success: true, message: "Removed." })}
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove ace smith/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove jordan smith/i })).toBeInTheDocument();
  });

  it("resends pending invitations", async () => {
    const resendInvitation = vi.fn().mockResolvedValue({
      success: true,
      message: "Invitation resent to brother@example.com."
    });

    render(
      <MembersSection
        account={account}
        members={members}
        pendingInvitations={pendingInvitations}
        currentUserId="user-1"
        onResendLLCInvitation={resendInvitation}
        onUpdateDistributionConfig={async () => ({ success: true })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Resend" }));

    await waitFor(() => {
      expect(resendInvitation).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Invitation resent to brother@example.com.");
  });
});
