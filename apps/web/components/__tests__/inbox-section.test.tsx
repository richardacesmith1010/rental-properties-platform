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
    senderEmail: null, body: "Hello", channel: "in_app", direction: "inbound",
    createdAt: "2026-10-05T00:00:00Z"
  }]
};
const noop = vi.fn(async () => ({ success: true as const }));

describe("InboxSection tenant conversation", () => {
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
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("lists tenant-started threads for an administrator", () => {
    render(<InboxSection notifications={[]} threads={[thread]} properties={[home]} onMarkRead={noop} onSendMessage={noop} />);
    fireEvent.click(screen.getByRole("tab", { name: "Threads" }));
    expect(screen.getByRole("button", { name: /Messages with your landlord/ })).toBeInTheDocument();
  });
});
