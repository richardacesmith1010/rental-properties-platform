import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TenantInboxView } from "@/components/dashboard/inbox-views";
import type { InboxThreadDTO } from "@/lib/inbox";

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormState: (action: unknown, initial: unknown) => [initial, action],
  useFormStatus: () => ({ pending: false })
}));

const thread: InboxThreadDTO = {
  id: "thread-1",
  propertyId: "home-1",
  propertyName: "Atlas House",
  entityType: "tenant_profile",
  entityId: "tenant-1",
  subject: "Messages with your landlord",
  createdByProfileId: "tenant-1",
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
  latestMessagePreview: "A reply",
  messageCount: 2,
  messages: [
    {
      id: "mine",
      threadId: "thread-1",
      senderProfileId: "tenant-1",
      senderEmail: null,
      senderName: "Tenant",
      body: "My message",
      channel: "in_app",
      direction: "outbound",
      createdAt: "2026-10-05T00:00:00Z"
    },
    {
      id: "theirs",
      threadId: "thread-1",
      senderProfileId: "landlord-1",
      senderEmail: null,
      senderName: "Landlord",
      body: "A reply",
      channel: "in_app",
      direction: "outbound",
      createdAt: "2026-10-05T00:01:00Z"
    }
  ]
};

describe("tenant inbox bubble colors", () => {
  it("renders own messages with hero colors and replies with surface-3", () => {
    render(
      <TenantInboxView
        hasActiveLease
        threads={[thread]}
        properties={[{ id: "home-1", name: "Atlas House" }]}
        currentUserId="tenant-1"
        startAction={() => undefined}
        startState={null}
        sendMessageAction={() => undefined}
        sendMessageState={null}
        selectedThread={thread}
        selectedThreadId="thread-1"
        setSelectedThreadId={() => undefined}
        homesWithoutThread={[]}
      />
    );

    const mine = screen.getByText("My message").parentElement;
    const theirs = screen.getByText("A reply").parentElement;

    expect(mine).toHaveClass("bg-[var(--hero)]", "text-[var(--hero-ink)]");
    expect(mine).not.toHaveClass("bg-[var(--action)]");
    expect(theirs).toHaveClass("bg-[var(--surface-3)]");
  });
});
