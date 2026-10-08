import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { CopyInviteLinkButton, ExpiredInviteLinkNote } from "../invitations-panel";
import type { InvitationListItem } from "@/lib/invitations";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const invitation: InvitationListItem = {
  id: "2e7bd787-5518-4fce-b9b0-4fa19c2ff324", email: "tenant@example.com", fullName: "Tenant",
  role: "tenant", propertyId: null, propertyName: null, ownershipAccountName: null,
  status: "pending", createdAt: "2026-10-07", acceptedAt: null
};
const originalOrigin = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = originalOrigin;
  vi.clearAllMocks();
});

describe("copy invite link", () => {
  it("appears only for pending tenant or manager rows", () => {
    const { rerender } = render(<CopyInviteLinkButton invitation={invitation} />);
    expect(screen.getByRole("button", { name: "Copy link" })).toHaveAttribute("title", "Copy a join link you can text.");
    rerender(<CopyInviteLinkButton invitation={{ ...invitation, status: "accepted" }} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<CopyInviteLinkButton invitation={{ ...invitation, role: "owner" }} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<CopyInviteLinkButton invitation={{ ...invitation, role: "manager" }} />);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("hides expired pending links and explains how to get a new one", () => {
    const expired = { ...invitation, createdAt: "2026-09-08T00:00:00.000Z" };
    render(<><CopyInviteLinkButton invitation={expired} /><ExpiredInviteLinkNote invitation={expired} /></>);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.getByText("Link expired. Resend to get a new one.")).toBeInTheDocument();
  });

  it("keeps active links and accepted rows unchanged", () => {
    const recent = { ...invitation, createdAt: new Date().toISOString() };
    const { rerender } = render(<><CopyInviteLinkButton invitation={recent} /><ExpiredInviteLinkNote invitation={recent} /></>);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.queryByText("Link expired. Resend to get a new one.")).toBeNull();
    const accepted = { ...recent, status: "accepted" as const };
    rerender(<><CopyInviteLinkButton invitation={accepted} /><ExpiredInviteLinkNote invitation={accepted} /></>);
    expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
    expect(screen.queryByText("Link expired. Resend to get a new one.")).toBeNull();
  });

  it("copies the canonical URL and shows success", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://domus.example";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyInviteLinkButton invitation={invitation} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`https://domus.example/join/${invitation.id}`));
    expect(toast.success).toHaveBeenCalledWith("Link copied. Text it to them.");
  });

  it("uses the fallback origin and shows failure", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CopyInviteLinkButton invitation={invitation} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not copy. Try again."));
    expect(writeText).toHaveBeenCalledWith(`https://domusbase.com/join/${invitation.id}`);
  });
});
