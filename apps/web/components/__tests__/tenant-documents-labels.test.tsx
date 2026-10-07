import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TenantDocumentsSection } from "@/components/dashboard/tenant-documents-section";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

describe("tenant document labels", () => {
  it("shows plain document and signature statuses", () => {
    render(<TenantDocumentsSection
      packets={[{
        id: "packet-1", templateName: "Lease", propertyLabel: "Forum House",
        status: "signed", signerStatus: "signed", createdAt: "2026-10-01T00:00:00Z",
        sentAt: null, signedAt: "2026-10-02T00:00:00Z"
      }]}
      files={[]}
      onSignPacket={vi.fn()}
    />);
    expect(screen.getByText("Documents: Signed")).toBeInTheDocument();
    expect(screen.getByText("Your signature: Signed")).toBeInTheDocument();
  });
});
