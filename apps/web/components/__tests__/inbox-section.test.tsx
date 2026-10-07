import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InboxSection } from "@/components/dashboard/inbox-section";
import type { InboxThreadDTO } from "@/lib/inbox";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

const home = { id: "11111111-1111-4111-8111-111111111111", name: "Atlas House" };
const thread: InboxThreadDTO = {
  id: "thread-1",
  propertyId: home.id,
  propertyName: home.name,
  entityType: "tenant_profile",
  entityId: "tenant-1",
  subject: "Messages with your landlord",
  createdByProfileId: "tenant-1",
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
  latestMessagePreview: "Hello",
  messageCount: 1,
  messages: [{
    id: "message-1", threadId: "thread-1", senderProfileId: "tenant-1",
    senderEmail: null, senderName: "Alex Landlord", body: "Hello", channel: "in_app", direction: "inbound",
    createdAt: "2026-10-05T00:00:00Z"
  }]
};
const noop = vi.fn(async () => ({ success: true as const }));

describe("InboxSection tenant conversation", () => {
  it("explains no lease and prevents sending a typed message", () => {
    const onStart = vi.fn(async () => ({ success: true as const }));
    render(
      <InboxSection
        notifications={[]}
        threads={[]}
        properties={[]}
        onMarkRead={noop}
        onStartTenantConversation={onStart}
        hasActiveLease={false}
      />
    );
    expect(screen.getByText(
      "Once your landlord sets up your lease, you can report problems. You can also send messages."
    )).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Hello landlord" } });
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    fireEvent.click(send);
    const form = send.closest("form");
    expect(form).not.toBeNull();
    expect(fireEvent.submit(form!)).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("shows a message composer before any thread exists", () => {
    render(<InboxSection notifications={[]} threads={[]} properties={[home]} onMarkRead={noop} onSendMessage={noop} onStartTenantConversation={noop} />);
    expect(screen.getByText("Message your landlord")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("shows home selection for a tenant with multiple homes", () => {
    render(<InboxSection notifications={[]} threads={[]} properties={[home, { id: "home-2", name: "Noctis House" }]} onMarkRead={noop} onStartTenantConversation={noop} />);
    expect(screen.getByLabelText("Which home?")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Noctis House" })).toBeInTheDocument();
  });

  it("keeps a composer for another home after one thread exists", () => {
    render(<InboxSection notifications={[]} threads={[thread]} properties={[home, { id: "home-2", name: "Noctis House" }]} onMarkRead={noop} onSendMessage={noop} onStartTenantConversation={noop} />);
    expect(screen.getByLabelText("Which home?")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Noctis House" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Atlas House" })).not.toBeInTheDocument();
  });

  it("shows the sent message and reply box after refresh", () => {
    render(<InboxSection notifications={[]} threads={[thread]} properties={[home]} onMarkRead={noop} onSendMessage={noop} onStartTenantConversation={noop} />);
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Write a message…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("renders tenant messages as a simple chat", () => {
    const landlordThread = { ...thread, messages: [
      { ...thread.messages[0], id: "landlord", senderProfileId: "landlord-1", senderName: "Alex Landlord", direction: "outbound" as const, body: "Welcome home." },
      { ...thread.messages[0], id: "tenant", senderProfileId: "tenant-1", body: "Thank you." }
    ], messageCount: 2 };
    render(<InboxSection notifications={[{ id: "n", type: "owner_message", title: "Alert", body: "Alert", entityType: "general", entityId: null, createdAt: "2026-10-05", readAt: null }]} threads={[landlordThread]} properties={[home]} currentUserId="tenant-1" onMarkRead={noop} onSendMessage={noop} onStartTenantConversation={noop} />);
    expect(screen.getByText("Alex Landlord")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Timeline" })).not.toBeInTheDocument();
    expect(screen.queryByText("unread")).not.toBeInTheDocument();
  });

  it("lists tenant-started threads for an administrator", () => {
    render(<InboxSection notifications={[]} threads={[thread]} properties={[home]} onMarkRead={noop} onSendMessage={noop} />);
    expect(screen.getByRole("tab", { name: "Threads" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /Messages with your tenant/ })).toBeInTheDocument();
  });
  it("opens owner updates when a notification is unread", () => {
    render(<InboxSection viewerRole="owner" notifications={[{ id: "n", type: "owner_message", title: "Alert",
      body: "Alert", entityType: "general", entityId: null, createdAt: "2026-10-05", readAt: null }]}
      threads={[thread]} properties={[home]} onMarkRead={noop} />);
    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows role-specific empty update copy", () => {
    const { rerender } = render(<InboxSection viewerRole="owner" notifications={[]} threads={[]}
      properties={[home]} onMarkRead={noop} />);
    expect(screen.getByText("No updates yet")).toBeInTheDocument();
    expect(screen.getByText("Rent, repair, and lease updates show up here.")).toBeInTheDocument();
    rerender(<InboxSection viewerRole="tenant" notifications={[]} threads={[]} properties={[home]}
      onMarkRead={noop} />);
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText("Your landlord can message you here.")).toBeInTheDocument();
  });

  it("shows payment thread titles for owner and tenant", () => {
    const paymentThread = { ...thread, subject: "Manual payment review - Atlas House" };
    const { rerender } = render(<InboxSection viewerRole="owner" notifications={[]} threads={[paymentThread]}
      properties={[home]} onMarkRead={noop} />);
    expect(screen.getAllByText("Tenant says rent is paid - Atlas House")).toHaveLength(2);
    rerender(<InboxSection viewerRole="tenant" notifications={[]} threads={[paymentThread]}
      properties={[home]} onMarkRead={noop} onStartTenantConversation={noop} />);
    expect(screen.getByText("Atlas House")).toBeInTheDocument();
    expect(screen.queryByText("Tenant says rent is paid - Atlas House")).not.toBeInTheDocument();
  });

  it("opens manager conversations without unread updates", () => {
    render(<InboxSection viewerRole="manager" notifications={[]} threads={[thread]}
      properties={[home]} onMarkRead={noop} />);
    expect(screen.getByRole("tab", { name: "Threads" })).toHaveAttribute("aria-selected", "true");
  });

});
